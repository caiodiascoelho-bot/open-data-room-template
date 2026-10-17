let initialized = false;
export async function initializeTelemetry(dsn?: string) {
  if (!dsn || initialized) return;
  const Sentry = await import("@sentry/react");
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    integrations: (defaults) => defaults.filter((item) => item.name !== "BrowserSession"),
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.extra;
      event.breadcrumbs = [];
      for (const item of event.exception?.values || [])
        item.value = "Client error — details withheld for privacy";
      return event;
    },
  });
  initialized = true;
}
