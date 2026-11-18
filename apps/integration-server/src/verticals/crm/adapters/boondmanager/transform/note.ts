// BoondManager does not expose a standalone notes resource.
// Notes are embedded as the `content` field on action items (/actions) and
// are surfaced through the Activity resource (Activity.note).
// This adapter returns 501 for all Note operations automatically.

export {}
