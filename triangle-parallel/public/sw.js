// 다른 창으로 넘어간 학생에게 기기 알림을 띄우기 위한 최소 서비스 워커.
// 페이지를 저장(캐시)하지 않는다. 알림을 누르면 풀던 창으로 돌아간다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = list.find((c) => new URL(c.url).pathname.startsWith('/u/')) || list[0];
    if (win) return win.focus();
    return self.clients.openWindow('/');
  })());
});
