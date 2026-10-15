(() => {
  "use strict";

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const text = (value) => escape(String(value ?? "").trim() || "To be announced");
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const ms = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? new Date(ms) : null;
  }

  function dateLabel(value) {
    const date = validDate(value);
    return date ? new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(date) : "To be announced";
  }

  function timeLabel(value) {
    if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${value}:00+08:00`));
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  function field(label, value) {
    return `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`;
  }

  function list(items) {
    return Array.isArray(items) && items.length ? `<ul>${items.map((item) => `<li>${text(item)}</li>`).join("")}</ul>` : "<p>To be announced</p>";
  }

  function card(event, index, going, isGuest, canManage = false) {
    const date = validDate(event.date);
    const start = timeLabel(event.startTime);
    const end = timeLabel(event.endTime);
    const time = start ? `${start}${end ? ` – ${end}` : " · End time to be announced"}` : "To be announced";
    const sample = event.status === "sample";
    const cancelled = event.status === "cancelled";
    const registration = !sample && !cancelled && safeLink(event.registrationUrl);
    const address = String(event.address || "").trim();
    const map = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${event.venue || ""}, ${address}`)}` : null;
    const fee = typeof event.fee === "number" && Number.isFinite(event.fee) && event.fee >= 0 ? event.fee === 0 ? "Free admission" : `${money(event.fee)} per person` : "To be announced";
    const capacity = Number.isInteger(event.capacity) && event.capacity > 0 ? `${event.capacity} attendees maximum` : "To be announced";
    const seats = Number.isInteger(event.availableSeats) ? `${event.attendeeCount || 0} going · ${event.availableSeats} seats left` : "Capacity to be announced";
    const buttonLabel = going ? "Cancel RSVP" : isGuest && event.rsvpOpen ? "Login to RSVP" : event.rsvpOpen ? "RSVP · Going" : "RSVP unavailable";
    const email = typeof event.contactEmail === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(event.contactEmail) ? event.contactEmail : null;
    const phone = typeof event.contactPhone === "string" && /^\+?[\d ()-]{7,25}$/.test(event.contactPhone) ? event.contactPhone : null;
    const contact = [email && `<a href="mailto:${escape(encodeURIComponent(email))}">${escape(email)}</a>`, phone && `<a href="tel:${escape(phone.replace(/[^+\d]/g, ""))}">${escape(phone)}</a>`].filter(Boolean).join("<br>") || "To be announced";
    const status = cancelled ? "Cancelled" : sample ? "Sample listing" : event.status === "confirmed" && date ? "Confirmed schedule" : "Schedule to be confirmed";
    return `<article class="event-card" aria-labelledby="eventTitle${index}">
      <div class="event-overview">
        <div class="date-chip" aria-hidden="true"><b>${date ? date.getUTCDate() : "TBA"}</b><span>${date ? new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "short" }).format(date) : "Date"}</span></div>
        <div class="event-intro"><div class="event-badges"><span class="pill yellow">${text(event.type)}</span><span class="event-status">${status}</span></div>
          <h2 id="eventTitle${index}">${text(event.title)}</h2><p>${text(event.description)}</p></div>
      </div>
      <dl class="event-facts">
        ${field("Date", text(dateLabel(event.date)))}
        ${field("Time · Philippine time (UTC+8)", text(time))}
        ${field("Venue", `${text(event.venue)}<small>${text(event.address)}</small>${map ? `<a href="${escape(map)}" target="_blank" rel="noopener noreferrer">View location ↗</a>` : ""}`)}
        ${field("Admission fee", escape(fee))}
      </dl>
      <details class="event-more"><summary>View full event details</summary><div class="event-detail-grid">
        <section><h3>Activities &amp; preparation</h3><h4>Program</h4>${list(event.agenda)}<h4>What to bring</h4>${list(event.bring)}<h4>What's included</h4>${list(event.included)}</section>
        <section><h3>Attendance &amp; registration</h3><dl>
          ${field("Who can attend", text(event.audience))}
          ${field("Capacity", `${escape(capacity)}<small class="event-seat-count">${escape(seats)}</small>`)}
          ${field("Registration deadline", text(dateLabel(event.registrationDeadline)))}
          ${field("Registration", registration ? `<a href="${escape(registration)}" target="_blank" rel="noopener noreferrer">Organizer's registration page ↗</a>` : cancelled ? "Registration closed" : "Registration details to be announced")}
          ${field("Accessibility", text(event.accessibility))}
        </dl></section>
        <section><h3>Organizer &amp; policies</h3><dl>
          ${field("Organizer", text(event.organizer))}
          ${field("Contact", contact)}
          ${field("Event rules", text(event.rules))}
          ${field("Cancellation / refund policy", text(event.cancellationPolicy))}
        </dl></section>
      </div></details>
      <div class="event-actions"><button type="button" class="${going ? "ghost-btn" : "primary-btn"} event-rsvp" data-event-index="${index}" aria-pressed="${going}" ${canManage || (!going && !event.rsvpOpen) ? "disabled" : ""}>${canManage ? "Member RSVPs" : buttonLabel}</button>
        ${registration ? `<a class="ghost-btn" href="${escape(registration)}" target="_blank" rel="noopener noreferrer">Register with organizer ↗</a>` : ""}
        <small class="event-rsvp-note">${going ? "Your RSVP is saved to your account. You can cancel to release your seat." : text(event.closedReason || "RSVP reserves one seat for your account. Any admission fee is paid directly to the organizer.")}</small>
      </div>
      ${canManage ? `<div class="event-admin-actions"><button type="button" class="ghost-btn event-edit" data-event-index="${index}">Edit event</button><button type="button" class="ghost-btn event-attendees" data-event-index="${index}">View attendees (${Number(event.attendeeCount) || 0})</button><div class="event-attendee-list" role="status"></div></div>` : ""}
      <p class="event-action-status" role="status"></p>
    </article>`;
  }

  function mount({ container, events = [], isGuest = true, onRsvp, requireRsvpAccess, canManage = false, onEdit, onAttendees }) {
    if (!container) return;
    container.innerHTML = `
      <aside class="event-notice"><strong>Plan your next build together.</strong><p>${events.some((event) => event.status === "sample") ? "Sample listings are shown while confirmed event details are being collected. RSVP is closed for these samples. " : ""}RSVP reserves one seat for your signed-in account. Cancel an RSVP to release your seat. Unconfirmed details are marked “To be announced.”</p></aside>
      <div class="event-toolbar"><label for="eventSearch">Find an event<input type="search" id="eventSearch" placeholder="Search name, venue, or activity" /></label><label for="eventType">Event type<select id="eventType"><option value="all">All event types</option>${[...new Set(events.map((event) => event.type).filter(Boolean))].map((type) => `<option value="${escape(type)}">${escape(type)}</option>`).join("")}</select></label></div>
      <p id="eventCount" class="event-count" role="status"></p><div class="event-list" id="eventList"></div>`;
    const search = container.querySelector("#eventSearch");
    const type = container.querySelector("#eventType");
    const eventList = container.querySelector("#eventList");
    function draw() {
      const query = search.value.trim().toLowerCase();
      const matching = events.map((event, index) => ({ event, index })).filter(({ event }) =>
        (type.value === "all" || event.type === type.value)
        && [event.title, event.description, event.venue, event.address, ...(event.agenda || [])].join(" ").toLowerCase().includes(query));
      eventList.innerHTML = matching.map(({ event, index }) => card(event, index, event.myRsvp === "going", isGuest, canManage)).join("") || '<div class="empty">No events match. Try another name or event type.</div>';
      container.querySelector("#eventCount").textContent = `${matching.length} event${matching.length === 1 ? "" : "s"} found`;
    }
    eventList.addEventListener("click", async (event) => {
      const button = event.target.closest(".event-rsvp, .event-edit, .event-attendees");
      if (!button) return;
      const item = events[Number(button.dataset.eventIndex)];
      if (button.matches(".event-edit")) return onEdit?.(item);
      const article = button.closest(".event-card");
      const status = article.querySelector(".event-action-status");
      if (button.matches(".event-attendees")) {
        button.disabled = true;
        try {
          const data = await onAttendees(item.id);
          article.querySelector(".event-attendee-list").innerHTML = data.attendees.length
            ? `<ul>${data.attendees.map((entry) => `<li>${text(entry.username)} · ${escape(new Date(entry.joinedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }))}</li>`).join("")}</ul>` : "No RSVPs yet.";
          status.textContent = "";
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
        return;
      }
      if (requireRsvpAccess && !requireRsvpAccess()) return;
      if (isGuest || !onRsvp) return;
      const cancel = item.myRsvp === "going";
      button.disabled = true;
      status.textContent = cancel ? "Cancelling your RSVP…" : "Saving your RSVP…";
      try {
        Object.assign(item, await onRsvp(item.id, cancel));
        status.textContent = cancel ? "RSVP cancelled. Your seat has been released." : "RSVP confirmed and saved to your account.";
      } catch (error) {
        if (error.event) Object.assign(item, error.event);
        status.textContent = error.message;
      } finally {
        const going = item.myRsvp === "going";
        button.disabled = !going && !item.rsvpOpen;
        button.textContent = going ? "Cancel RSVP" : item.rsvpOpen ? "RSVP · Going" : "RSVP unavailable";
        button.classList.toggle("ghost-btn", going);
        button.classList.toggle("primary-btn", !going);
        button.setAttribute("aria-pressed", String(going));
        article.querySelector(".event-seat-count").textContent = `${item.attendeeCount || 0} going · ${item.availableSeats ?? "TBA"} seats left`;
        article.querySelector(".event-rsvp-note").textContent = going ? "Your RSVP is saved to your account. You can cancel to release your seat." : item.closedReason || "RSVP reserves one seat for your account. Any admission fee is paid directly to the organizer.";
      }
    });
    search.addEventListener("input", draw);
    type.addEventListener("change", draw);
    draw();
  }

  async function load({ container, api, account, requireRsvpAccess }) {
    const request = async (path = "", options = {}) => {
      try {
        const response = await fetch(`${api}/events${path}`, { ...options, cache: "no-store", signal: AbortSignal.timeout(20000),
          headers: { ...(account?.token ? { Authorization: `Bearer ${account.token}` } : {}), ...(options.body ? { "Content-Type": "application/json" } : {}) } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(data.message || "Unable to load events. Please try again.");
          error.event = data.event;
          throw error;
        }
        return data;
      } catch (error) {
        if (["AbortError", "TimeoutError"].includes(error.name) || error.name === "TypeError") throw new Error(options.method ? "The RSVP or event request could not be confirmed. Reload events to check whether it saved; repeating the same RSVP will not book another seat." : "Unable to reach events. Check your connection and try again.");
        throw error;
      }
    };
    container.innerHTML = '<p class="event-count" role="status">Loading events…</p>';
    try {
      const { events, canManage } = await request();
      mount({ container, events, isGuest: !account?.token, canManage, requireRsvpAccess,
        onRsvp: (id, cancel) => request(`/${encodeURIComponent(id)}/rsvp`, { method: cancel ? "DELETE" : "PUT" }),
        onAttendees: (id) => request(`/${encodeURIComponent(id)}/attendees`),
        onEdit: (event) => window.GUNPLA_EVENT_MANAGER?.edit(event)
      });
      const toolbar = document.createElement("div");
      toolbar.className = "event-page-actions";
      toolbar.innerHTML = `<button type="button" class="ghost-btn" id="reloadEvents">Reload events</button>${canManage ? '<button type="button" class="primary-btn" id="newEvent">Add event</button><div id="eventManager"></div>' : ""}`;
      container.prepend(toolbar);
      toolbar.querySelector("#reloadEvents").addEventListener("click", () => load({ container, api, account, requireRsvpAccess }));
      if (canManage) {
        window.GUNPLA_EVENT_MANAGER.mount({ container: toolbar.querySelector("#eventManager"), request, onSaved: () => load({ container, api, account, requireRsvpAccess }) });
        toolbar.querySelector("#newEvent").addEventListener("click", () => window.GUNPLA_EVENT_MANAGER.edit());
      }
    } catch (error) {
      container.innerHTML = `<div class="empty" role="alert"><p>${escape(error.message)}</p><button type="button" class="ghost-btn" id="retryEvents">Retry events</button> <a class="ghost-btn" href="login.html">Sign in</a></div>`;
      container.querySelector("#retryEvents").addEventListener("click", () => load({ container, api, account, requireRsvpAccess }));
    }
  }

  window.GUNPLA_EVENTS = { load, mount, card, dateLabel, timeLabel, safeLink };
})();
