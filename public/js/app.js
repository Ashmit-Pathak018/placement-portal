// Client-side JS — notification polling and utilities

(function () {
  'use strict';

  // Poll for unread notification count
  const badge = document.getElementById('unread-count');
  if (badge) {
    function fetchUnreadCount() {
      fetch('/api/notifications/unread-count')
        .then(r => r.json())
        .then(data => {
          if (data.count > 0) {
            badge.textContent = data.count;
            badge.style.display = 'inline';
          } else {
            badge.style.display = 'none';
          }
        })
        .catch(() => {});
    }
    fetchUnreadCount();
    setInterval(fetchUnreadCount, 15000); // every 15s
  }

  // Auto-hide flash messages after 5s
  document.querySelectorAll('.alert').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity 0.5s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 500);
    }, 5000);
  });

  // Batch selection in applicant tables
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function () {
      document.querySelectorAll('.app-checkbox').forEach(cb => {
        cb.checked = this.checked;
      });
    });
  }

  // Confirm dangerous actions
  document.querySelectorAll('[data-confirm]').forEach(el => {
    el.addEventListener('click', function (e) {
      if (!confirm(this.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });
})();
