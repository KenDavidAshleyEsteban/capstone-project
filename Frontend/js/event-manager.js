(() => {
  "use strict";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  let context;
  const fields = [
    ['title', 'Event name', 'text', 160], ['type', 'Event type', 'text', 60], ['description', 'Description', 'textarea', 3000],
    ['date', 'Event date', 'date'], ['startTime', 'Start time · Philippine time', 'time'], ['endTime', 'End time · Philippine time', 'time'],
    ['venue', 'Venue name', 'text', 160], ['address', 'Full venue address', 'text', 300],
    ['fee', 'Fee per person (PHP; 0 = free)', 'number'], ['capacity', 'Maximum attendees (1–10,000)', 'number'],
    ['organizer', 'Organizer', 'text', 160], ['contactEmail', 'Organizer email', 'email', 200], ['contactPhone', 'Organizer phone', 'text', 40],
    ['audience', 'Who can attend', 'text', 500], ['registrationDeadline', 'Registration deadline (until end of day)', 'date'], ['registrationUrl', 'Additional organizer registration link', 'url', 1000],
    ['agenda', 'Program (one item per line)', 'list'], ['bring', 'What to bring (one item per line)', 'list'], ['included', 'Included materials (one item per line)', 'list'],
    ['accessibility', 'Accessibility', 'textarea', 1000], ['rules', 'Event rules', 'textarea', 2000], ['cancellationPolicy', 'Cancellation / refund policy', 'textarea', 2000]
  ];

  function mount(options) { context = options; }

  function edit(event = {}) {
    if (!context) return;
    const { container, request, onSaved } = context;
    container.innerHTML = `<section class="event-editor" aria-labelledby="eventEditorTitle">
      <h2 id="eventEditorTitle">${event.id ? "Edit event" : "Add event"}</h2>
      <p>Publish only confirmed information. Confirmed events require a complete schedule, venue/address, organizer, fee, and capacity before RSVPs can open. One RSVP reserves one seat; fees are arranged with the organizer.</p>
      <form id="eventForm" class="event-form">
        <label>Status<select name="status"><option value="sample">Sample · RSVP closed</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled · RSVP closed</option></select></label>
        ${fields.map(([key, label, type, max]) => {
          const value = type === "list" ? (event[key] || []).join("\n") : event[key] ?? "";
          return `<label class="${["textarea", "list"].includes(type) ? "event-field-wide" : ""}">${label}${["textarea", "list"].includes(type)
            ? `<textarea name="${key}" ${max ? `maxlength="${max}"` : "maxlength=9300"}>${escape(value)}</textarea>`
            : `<input name="${key}" type="${type}" value="${escape(value)}" ${max ? `maxlength="${max}"` : ""} ${type === "number" ? `min="${key === "fee" ? 0 : 1}" max="${key === "fee" ? 1000000 : 10000}" step="${key === "fee" ? '.01' : 1}"` : ""} />`}</label>`;
        }).join("")}
        <div class="event-editor-actions"><button class="primary-btn" type="submit">Save event</button><button class="ghost-btn" type="button" id="closeEventEditor">Close editor</button></div>
        <p id="eventEditorStatus" class="event-action-status" role="status"></p>
      </form></section>`;
    const form = container.querySelector("form");
    const status = container.querySelector("#eventEditorStatus");
    form.elements.status.value = event.status || "sample";
    const updateRequired = () => {
      const confirmed = form.elements.status.value === "confirmed";
      for (const key of ['title', 'type', 'description']) form.elements[key].required = true;
      for (const key of ['date', 'startTime', 'endTime', 'venue', 'address', 'organizer', 'fee', 'capacity']) form.elements[key].required = confirmed;
    };
    form.elements.status.addEventListener("change", updateRequired);
    updateRequired();
    container.querySelector("#closeEventEditor").addEventListener("click", () => container.replaceChildren());
    form.addEventListener("submit", async (submit) => {
      submit.preventDefault();
      if (!form.reportValidity()) return;
      const body = { status: form.elements.status.value };
      for (const [key, , type] of fields) {
        const value = form.elements[key].value.trim();
        body[key] = type === "list" ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
          : type === "number" ? value === "" ? null : Number(value) : value;
      }
      if (event.id) body.expectedRevision = event.revision;
      const buttons = [...form.querySelectorAll("button")];
      buttons.forEach((button) => { button.disabled = true; });
      status.textContent = "Saving event…";
      try {
        await request(event.id ? `/${encodeURIComponent(event.id)}` : "", { method: event.id ? "PUT" : "POST", body: JSON.stringify(body) });
        await onSaved();
      } catch (error) { status.textContent = error.message; }
      finally { buttons.forEach((button) => { button.disabled = false; }); }
    });
    container.scrollIntoView({ block: "start", behavior: "instant" });
    form.elements.title.focus();
  }

  window.GUNPLA_EVENT_MANAGER = { mount, edit };
})();
