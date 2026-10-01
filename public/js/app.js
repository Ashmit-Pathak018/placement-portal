// CampusPlace Client-Side JavaScript
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    // 2. Mobile Menu Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileBtn && mobileMenu) {
      mobileBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
    }

    // 3. Notification Bell & Dropdown
    const notifBtn = document.getElementById('notification-bell-btn');
    const notifDropdown = document.getElementById('notifications-dropdown');
    const notifList = document.getElementById('notifications-list');
    const unreadBadge = document.getElementById('unread-count');

    // Poll unread count
    function updateUnreadBadge() {
      fetch('/api/notifications/unread-count')
        .then(r => r.json())
        .then(data => {
          if (unreadBadge) {
            if (data.count > 0) {
              unreadBadge.textContent = data.count > 99 ? '99+' : data.count;
              unreadBadge.classList.remove('hidden');
            } else {
              unreadBadge.classList.add('hidden');
            }
          }
        })
        .catch(() => {});
    }

    if (notifBtn) {
      updateUnreadBadge();
      setInterval(updateUnreadBadge, 15000);

      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!notifDropdown) return;
        const isHidden = notifDropdown.classList.contains('hidden');

        if (isHidden) {
          notifDropdown.classList.remove('hidden');
          // Fetch notifications
          fetch('/api/notifications')
            .then(r => r.json())
            .then(data => {
              if (notifList) {
                if (!data.notifications || data.notifications.length === 0) {
                  notifList.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No notifications yet.</div>';
                } else {
                  notifList.innerHTML = data.notifications.map(n => `
                    <a href="${n.link || '#'}" class="block p-3 hover:bg-slate-50 transition-colors ${n.is_read ? 'opacity-70' : 'bg-brand-50/30'}">
                      <div class="text-xs text-slate-800 font-medium leading-snug">${escapeHtml(n.message)}</div>
                      <div class="text-[10px] text-slate-400 mt-1">${formatTime(n.created_at)}</div>
                    </a>
                  `).join('');
                }
              }
            })
            .catch(() => {
              if (notifList) notifList.innerHTML = '<div class="p-4 text-center text-xs text-rose-500">Failed to load notifications.</div>';
            });
        } else {
          notifDropdown.classList.add('hidden');
        }
      });

      // Close notification dropdown when clicking outside
      document.addEventListener('click', (e) => {
        if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
          notifDropdown.classList.add('hidden');
        }
      });
    }

    // 4. Auto-dismiss Toast Alerts
    document.querySelectorAll('.toast-alert').forEach(el => {
      setTimeout(() => {
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        el.style.opacity = '0';
        el.style.transform = 'translateY(-10px)';
        setTimeout(() => el.remove(), 400);
      }, 5000);
    });

    // 5. Batch Checkbox Selection & Counter
    const selectAll = document.getElementById('selectAll') || document.getElementById('select-all');
    const batchCounter = document.getElementById('batch-selected-count');
    const batchBar = document.getElementById('batch-actions-bar');

    function updateBatchSelectionState() {
      const checkboxes = document.querySelectorAll('input[name="applicationIds"]');
      const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
      
      if (batchCounter) {
        batchCounter.textContent = checkedCount;
      }
      if (batchBar) {
        if (checkedCount > 0) {
          batchBar.classList.remove('hidden');
        } else {
          batchBar.classList.add('hidden');
        }
      }
    }

    if (selectAll) {
      selectAll.addEventListener('change', function () {
        document.querySelectorAll('input[name="applicationIds"]').forEach(cb => {
          cb.checked = this.checked;
        });
        updateBatchSelectionState();
      });
    }

    document.querySelectorAll('input[name="applicationIds"]').forEach(cb => {
      cb.addEventListener('change', updateBatchSelectionState);
    });

    // 6. Confirm Dialog Helper
    document.querySelectorAll('[data-confirm]').forEach(el => {
      el.addEventListener('click', function (e) {
        if (!confirm(this.dataset.confirm)) {
          e.preventDefault();
        }
      });
    });
  });

  // Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }
})();
