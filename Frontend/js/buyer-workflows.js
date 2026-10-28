(() => {
  "use strict";

  // This client never persists purchases or balances. The authenticated API owns them.
  function create({ api, account, getAccount }) {
    function assertActive() {
      const active = getAccount();
      if (active?.id !== account?.id || active?.token !== account?.token) {
        const error = new Error("Account changed. Please try again.");
        error.code = "ACCOUNT_CHANGED";
        throw error;
      }
    }
    async function request(path, options = {}) {
      if (!account?.id || !account.token) throw new Error("Sign in again to load your account.");
      assertActive();
      try {
        const { responseType, ...fetchOptions } = options;
        const response = await fetch(`${api}/buyer${path}`, {
          ...fetchOptions,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${account.token}`, ...options.headers },
          cache: "no-store",
          signal: AbortSignal.timeout(15000)
        });
        const data = response.ok && responseType === "blob"
          ? await response.blob()
          : await response.json().catch(() => ({}));
        assertActive();
        if (!response.ok) {
          const error = new Error(data.message || "Unable to complete this request. Please try again.");
          error.code = data.code;
          error.status = response.status;
          throw error;
        }
        return data;
      } catch (error) {
        assertActive();
        throw error;
      }
    }
    const send = (path, body, method = "POST") => request(path, { method, body: JSON.stringify(body) });
    return {
      summary: () => request("/summary"),
      receiptQr: (id) => request(`/receipts/${encodeURIComponent(id)}/qr`, { responseType: "blob" }),
      rewards: () => request("/rewards"),
      reserve: (productId, requestId) => send("/reservations", { productId, quantity: 1, requestId }),
      reservations: () => request("/store/reservations"),
      updateReservation: (id, status) => send(`/reservations/${encodeURIComponent(id)}`, { status }, "PATCH"),
      claim: (token, requestId) => send("/claims", { token, requestId }),
      redeem: (rewardId, requestId) => send("/redemptions", { rewardId, requestId })
    };
  }

  function requestId() {
    return crypto.randomUUID();
  }

  async function decodeImage(file) {
    if (typeof window.jsQR !== "function") throw new Error("QR reader unavailable. Enter the receipt token below.");
    if (!file || !file.type.startsWith("image/")) throw new Error("Choose an image containing a receipt QR code.");
    if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const qr = window.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
      if (!qr?.data) throw new Error("No QR code found. Try a clearer image or enter the receipt token.");
      return qr.data;
    } finally {
      bitmap.close();
    }
  }

  window.GUNPLA_BUYER = { create, requestId, decodeImage };
})();
