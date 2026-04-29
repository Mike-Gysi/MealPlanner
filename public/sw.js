self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? 'Bee Hive'
  const options = {
    body: data.body ?? '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url ?? '/' },
    tag: data.tag ?? 'beehive',
    renotify: true,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      return clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})
