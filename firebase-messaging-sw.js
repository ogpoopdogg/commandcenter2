/*
Summary of changes:
1. Added a 'notificationclick' event listener to the service worker.
2. Included event.notification.close() to dismiss the alert when clicked.
3. Added logic to find an open app window, focus it, and send the jobId via postMessage.
4. Added fallback logic to open a new app window with the jobId in the URL if the app was closed.
*/

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAKmgoXA4m3cRTmxJq4aUyva5SVvFbTNqg",
  authDomain: "eandccourier-36fcc.firebaseapp.com",
  databaseURL: "https://eandccourier-36fcc-default-rtdb.firebaseio.com",
  projectId: "eandccourier-36fcc",
  messagingSenderId: "1067680083511",
  appId: "1:1067680083511:android:22d1eb3757302492bd19b2"
    });

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'icon2.png',
    data: payload.data,
    requireInteraction: true,
    tag: payload.data.jobId 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ec-command-store').then((cache) => cache.addAll([
      './', './index.html', './manifest.json', './icon2.png'
    ]))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const jobId = event.notification.data && event.notification.data.jobId;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then((focusedClient) => {
            if (jobId && focusedClient) {
              focusedClient.postMessage({
                type: 'OPEN_JOB_FROM_NOTIFICATION',
                jobId: jobId
              });
            }
          });
        }
      }
      
      if (clients.openWindow) {
        const url = jobId ? `./?jobId=${jobId}` : './';
        return clients.openWindow(url);
      }
    })
  );
});
