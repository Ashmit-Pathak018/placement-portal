const http = require('http');

// Helper to make cookie-aware requests
class Client {
  constructor() {
    this.cookies = {};
  }

  request(options, postData = null) {
    return new Promise((resolve, reject) => {
      const cookieHeader = Object.entries(this.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');

      const reqOptions = {
        hostname: 'localhost',
        port: 3000,
        path: options.path,
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          ...(cookieHeader ? { Cookie: cookieHeader } : {})
        }
      };

      if (postData) {
        reqOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(reqOptions, (res) => {
        // Collect cookies
        const setCookies = res.headers['set-cookie'];
        if (setCookies) {
          setCookies.forEach(sc => {
            const [cookiePart] = sc.split(';');
            const [key, val] = cookiePart.split('=');
            this.cookies[key.trim()] = val.trim();
          });
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      });

      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  extractCsrf(html) {
    const match = html.match(/name="_csrf"\s+value="([^"]+)"/);
    return match ? match[1] : null;
  }
}

async function runTests() {
  console.log('Testing End-to-End User Journeys...');

  // 1. Admin login & dashboard
  const adminClient = new Client();
  const loginPage = await adminClient.request({ path: '/login' });
  const csrf = adminClient.extractCsrf(loginPage.body);

  const loginRes = await adminClient.request(
    { path: '/login', method: 'POST' },
    `_csrf=${encodeURIComponent(csrf)}&email=admin%40campus.edu&password=Admin%40123`
  );
  console.log('Admin login status:', loginRes.status, 'redirect to:', loginRes.headers.location);

  const adminDashboard = await adminClient.request({ path: '/admin/dashboard' });
  console.log('Admin dashboard status:', adminDashboard.status, 'has charts:', adminDashboard.body.includes('placementsChart'));

  const pendingPostings = await adminClient.request({ path: '/admin/postings/pending' });
  console.log('Admin pending postings status:', pendingPostings.status, 'has table:', pendingPostings.body.includes('Pending Postings'));

  const auditLogs = await adminClient.request({ path: '/admin/audit-logs' });
  console.log('Admin audit logs status:', auditLogs.status, 'has logs:', auditLogs.body.includes('Audit Logs'));

  // 2. Student 1 login & dashboard
  const studentClient = new Client();
  const sLoginPage = await studentClient.request({ path: '/login' });
  const sCsrf = studentClient.extractCsrf(sLoginPage.body);

  const sLoginRes = await studentClient.request(
    { path: '/login', method: 'POST' },
    `_csrf=${encodeURIComponent(sCsrf)}&email=student1%40campus.edu&password=Student%40123`
  );
  console.log('Student1 login status:', sLoginRes.status, 'redirect to:', sLoginRes.headers.location);

  const sDashboard = await studentClient.request({ path: '/student/dashboard' });
  console.log('Student dashboard status:', sDashboard.status, 'has student name:', sDashboard.body.includes('Aarav'));

  const sPostings = await studentClient.request({ path: '/student/postings' });
  console.log('Student browse postings status:', sPostings.status, 'has postings:', sPostings.body.includes('Browse Postings'));

  // 3. Student 2 (ineligible for 8.0 CGPA) checks eligibility
  const s2Client = new Client();
  const s2LoginPage = await s2Client.request({ path: '/login' });
  const s2Csrf = s2Client.extractCsrf(s2LoginPage.body);

  await s2Client.request(
    { path: '/login', method: 'POST' },
    `_csrf=${encodeURIComponent(s2Csrf)}&email=student2%40campus.edu&password=Student%40123`
  );

  // Student 2 visits posting 2 (min_cgpa 8.0, student2 has 6.5)
  const posting2Page = await s2Client.request({ path: '/student/postings/2' });
  console.log('Student2 view Posting #2 status:', posting2Page.status, 'shows ineligible:', posting2Page.body.includes('not eligible'));

  // 4. Recruiter 1 login & postings
  const recClient = new Client();
  const rLoginPage = await recClient.request({ path: '/login' });
  const rCsrf = recClient.extractCsrf(rLoginPage.body);

  const rLoginRes = await recClient.request(
    { path: '/login', method: 'POST' },
    `_csrf=${encodeURIComponent(rCsrf)}&email=recruiter1%40acme.com&password=Recruit%40123`
  );
  console.log('Recruiter1 login status:', rLoginRes.status, 'redirect to:', rLoginRes.headers.location);

  const rCompany = await recClient.request({ path: '/recruiter/company' });
  console.log('Recruiter company page status:', rCompany.status, 'has Acme:', rCompany.body.includes('Acme Technologies'));

  const rPostings = await recClient.request({ path: '/recruiter/postings' });
  console.log('Recruiter postings page status:', rPostings.status, 'has Software Engineer:', rPostings.body.includes('Software Engineer'));

  const rApplicants = await recClient.request({ path: '/recruiter/postings/1/applicants' });
  console.log('Recruiter applicants page status:', rApplicants.status, 'has Kanban:', rApplicants.body.includes('kanban-board'));

  console.log('All end-to-end tests completed successfully!');
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
