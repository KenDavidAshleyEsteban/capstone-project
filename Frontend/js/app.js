(() => {
  "use strict";

  const DATA = window.GUNPLA_DATA;
  const app = document.getElementById("app");
  const page = document.body.dataset.page || "home";

  const keys = {
    receipts: "gunpla.receipts.v1",
    transactions: "gunpla.transactions.v1",
    redemptions: "gunpla.redemptions.v1",
    rsvps: "gunpla.rsvps.v1",
    account: "gunpla.account.v1",
    inventory: "gunpla.inventory.v1",
    reservations: "gunpla.reservations.v1",
    sellerOffers: "gunpla.sellerOffers.v1"
  };
  const guideVideoDbName = "gunpla.guideVideos.v1";
  const guideVideoStoreName = "videos";
  let guideVideoObjectUrls = [];

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const money = (value) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
  const byId = (id) => document.getElementById(id);
  const roleLabels = {
    guest: "Guest",
    admin: "Admin",
    buyer: "Buyer",
    seller: "Seller"
  };
  const accountRoles = ["buyer", "seller", "admin"];
  const API = window.GUNPLA_API_URL || (location.protocol === "file:" || ["5500", "5501"].includes(location.port) ? "http://localhost:5000/api" : "https://capstone-project-35cd.onrender.com/api");
  let navOutsideCloseBound = false;

  function normalizeAccountRole(role) {
    const normalized = String(role || "").trim().toLowerCase();
    return accountRoles.includes(normalized) ? normalized : null;
  }

  function decodeToken(token) {
    if (!token) return null;

    try {
      const payload = token.split(".")[1];
      if (!payload) return null;

      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const json = decodeURIComponent(
        atob(padded)
          .split("")
          .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join("")
      );

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function currentAccount() {
    const saved = read(keys.account, null);
    const token = saved?.token || localStorage.getItem("token");
    const decoded = decodeToken(token);

    if (token && !decoded) {
      localStorage.removeItem(keys.account);
      localStorage.removeItem("token");
      return null;
    }

    const role = normalizeAccountRole(decoded?.role) || normalizeAccountRole(saved?.role);

    if (decoded?.exp && decoded.exp * 1000 <= Date.now()) {
      localStorage.removeItem(keys.account);
      localStorage.removeItem("token");
      return null;
    }

    if (!role || !token) return null;

    return {
      email: saved?.email || decoded?.email || "",
      username: saved?.username || "",
      storeName: saved?.storeName || "",
      storeLocation: saved?.storeLocation || "",
      role,
      token
    };
  }

  function currentRole() {
    return currentAccount()?.role || "guest";
  }

  function roleHome(role) {
    if (role === "admin") return "admin-dashboard.html";
    if (role === "seller") return "admin-dashboard.html";
    return "discover.html";
  }

  function signOut() {
    localStorage.removeItem(keys.account);
    localStorage.removeItem("token");
    window.location.href = "login.html";
  }

  function accountChip() {
    const account = currentAccount();

    if (!account) {
      return `<a class="login-chip" href="login.html">Login</a>`;
    }

    return `<button class="login-chip" id="logoutBtn" type="button">${roleLabels[account.role]} Logout</button>`;
  }

  function getReceipts() {
    const saved = read(keys.receipts, null);
    if (saved) return saved;
    write(keys.receipts, DATA.seedReceipts);
    return [...DATA.seedReceipts];
  }

  function getTransactions() {
    return read(keys.transactions, []);
  }

  function getRedemptions() {
    return read(keys.redemptions, []);
  }

  const defaultSellerOffers = [
    {
      id: "offer-nippers",
      name: "Entry Nippers",
      category: "Tool",
      price: 420,
      stock: 14,
      status: "Available",
      description: "Budget side cutters for clean first-kit runner cuts."
    },
    {
      id: "offer-hobby-knife",
      name: "Hobby Knife",
      category: "Tool",
      price: 260,
      stock: 10,
      status: "Available",
      description: "Precision knife for careful nub cleanup and decal trimming."
    },
    {
      id: "offer-sanding-set",
      name: "Sanding Stick Set",
      category: "Supply",
      price: 180,
      stock: 22,
      status: "Available",
      description: "Mixed grit sanding sticks for smoothing gate marks."
    },
    {
      id: "offer-panel-service",
      name: "Panel Lining Service",
      category: "Service",
      price: 350,
      stock: 6,
      status: "Bookable",
      description: "Store-assisted panel lining for one HG or EG kit."
    }
  ];

  function getSellerOffers() {
    return read(keys.sellerOffers, defaultSellerOffers);
  }

  function setSellerOffers(offers) {
    write(keys.sellerOffers, offers);
  }

  function claimedIds() {
    return getTransactions().filter((item) => item.type === "claim").map((item) => item.receiptId);
  }

  function pointsBalance() {
    const earned = getTransactions().reduce((sum, item) => sum + Number(item.points || 0), 0);
    const spent = getRedemptions().reduce((sum, item) => sum + Number(item.cost || 0), 0);
    return Math.max(0, earned - spent);
  }

  function navItem(id, label, href, role = "") {
    const roleAttr = role ? ` role="${role}"` : "";
    return `<a class="${page === id ? "active" : ""}" href="${href}"${roleAttr}>${label}</a>`;
  }

  function navMenu(id, label, items) {
    const active = items.some((item) => page === item.id);
    const menuItems = items.map((item) => navItem(item.id, item.label, item.href, "menuitem")).join("");

    return `
      <div class="nav-menu ${active ? "active" : ""}" data-nav-menu="${id}">
        <button class="nav-menu-trigger ${active ? "active" : ""}" type="button" aria-expanded="false">
          ${label}
        </button>
        <div class="nav-dropdown" role="menu" aria-label="${label} menu">
          ${menuItems}
        </div>
      </div>
    `;
  }

  function closeNavMenus(exceptMenu = null) {
    document.querySelectorAll("[data-nav-menu]").forEach((menu) => {
      if (menu === exceptMenu) return;
      menu.classList.remove("open");
      menu.querySelector(".nav-menu-trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  function visibleNavItems() {
    const role = currentRole();
    const publicLinks = [
      { id: "home", label: "Home", href: "index.html" },
      { id: "discover", label: "Discover", href: "discover.html" },
      { id: "guide", label: "Guide", href: "beginner-guide.html" },
      { id: "stores", label: "Stores", href: "store.html" },
      { id: "events", label: "Events", href: "events.html" }
    ];
    const buyerLinks = [
      { id: "receipts", label: "Receipts", href: "receipts.html" },
      { id: "scan", label: "Scan QR", href: "scanqr.html" },
      { id: "points", label: "Points", href: "points.html" },
      { id: "rewards", label: "Rewards", href: "rewards.html" }
    ];
    const sellerLinks = [
      { id: "catalog", label: "Manage products", href: "admin-dashboard.html" },
      { id: "seller", label: "Dashboard", href: "seller-dashboard.html" },
      { id: "seller-offers", label: "Offers & Services", href: "seller-dashboard.html#sellerOffers" },
      { id: "seller-stock", label: "Stock Control", href: "seller-dashboard.html#sellerStock" },
      { id: "seller-insights", label: "Insights", href: "seller-dashboard.html#sellerInsights" }
    ];

    const items = publicLinks.map((item) => navItem(item.id, item.label, item.href));

    if (role === "buyer") items.push(navMenu("buyer", "Buyer", buyerLinks));
    if (role === "seller") items.push(navMenu("seller", "Seller", sellerLinks));
    if (role === "admin") items.push(navItem("admin", "Admin dashboard", "admin-dashboard.html"));

    return items.join("");
  }

  function shell(content) {
    app.innerHTML = `
      <header class="topbar">
        <div class="nav-wrap">
          <a class="brand" href="index.html"><b><span>GUNPLA</span> HUB</b><small>Baguio builders network</small></a>
          <button class="menu-btn" id="menuBtn" aria-label="Open menu">☰</button>
          <nav class="nav-links" id="navLinks">
            ${visibleNavItems()}
          </nav>
          ${accountChip()}
        </div>
      </header>
      <main id="mainContent" class="container">${content}</main>
      <div class="modal" id="modal" aria-hidden="true"><div class="modal-card"><button class="modal-close" id="modalClose">×</button><div id="modalBody"></div></div></div>
    `;

    byId("menuBtn")?.addEventListener("click", () => byId("navLinks").classList.toggle("open"));
    document.querySelectorAll("[data-nav-menu]").forEach((menu) => {
      const trigger = menu.querySelector(".nav-menu-trigger");

      trigger?.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = menu.classList.toggle("open");

        trigger.setAttribute("aria-expanded", String(isOpen));
        closeNavMenus(menu);
      });
    });

    if (!navOutsideCloseBound) {
      document.addEventListener("click", () => closeNavMenus());
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeNavMenus();
      });
      navOutsideCloseBound = true;
    }

    byId("logoutBtn")?.addEventListener("click", signOut);
    byId("modalClose")?.addEventListener("click", closeModal);
    byId("modal")?.addEventListener("click", (event) => {
      if (event.target.id === "modal") closeModal();
    });
  }

  function openModal(html) {
    byId("modalBody").innerHTML = html;
    byId("modal").classList.add("show");
    byId("modal").setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    byId("modal")?.classList.remove("show");
    byId("modal")?.setAttribute("aria-hidden", "true");
  }

  function titleBlock(kicker, title, text) {
    return `<section class="page-head"><p class="kicker">${kicker}</p><h1>${title}</h1><p>${text}</p></section>`;
  }

  function roleListText(roles) {
    return roles.map((role) => roleLabels[role]).join(" or ");
  }

  function requirePageAccess(roles) {
    const role = currentRole();

    if (roles.includes(role)) return true;

    const needs = roleListText(roles);
    const action = role === "guest"
      ? `<a class="primary-btn" href="login.html">Login or create account</a>`
      : `<button class="primary-btn" id="accessSignOut" type="button">Switch account</button>`;

    shell(`
      <section class="auth-card access-card">
        <div>
          <p class="kicker">${roleLabels[role]} access</p>
          <h1>${needs} only.</h1>
          <p>This page is restricted to ${needs.toLowerCase()} accounts.</p>
        </div>
        <div class="access-actions">
          ${action}
          <a class="ghost-btn" href="index.html">Go home</a>
        </div>
      </section>
    `);

    byId("accessSignOut")?.addEventListener("click", signOut);
    return false;
  }

  function requireActionAccess(roles, actionName) {
    const role = currentRole();

    if (roles.includes(role)) return true;

    const needs = roleListText(roles);
    const action = role === "guest"
      ? `<a class="primary-btn" href="login.html">Login or create account</a>`
      : `<button class="primary-btn" id="modalSignOut" type="button">Switch account</button>`;

    openModal(`
      <h2>${needs} account required</h2>
      <p>You need a ${needs.toLowerCase()} account to ${actionName}.</p>
      <div class="modal-actions">
        ${action}
        <button class="ghost-btn" type="button" id="modalStay">Stay here</button>
      </div>
    `);

    byId("modalSignOut")?.addEventListener("click", signOut);
    byId("modalStay")?.addEventListener("click", closeModal);
    return false;
  }

  function escapeHtml(value) {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return String(value ?? "").replace(/[&<>"']/g, (char) => replacements[char]);
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
  }

  function openGuideVideoDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB is not available."));
        return;
      }

      const request = indexedDB.open(guideVideoDbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(guideVideoStoreName)) {
          db.createObjectStore(guideVideoStoreName, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open video storage."));
    });
  }

  async function useGuideVideoStore(mode, operation) {
    const db = await openGuideVideoDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(guideVideoStoreName, mode);
      const store = transaction.objectStore(guideVideoStoreName);
      let request;

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error("Video storage transaction failed."));
      };

      try {
        request = operation(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Video storage request failed."));
    });
  }

  async function getGuideVideos() {
    const videos = await useGuideVideoStore("readonly", (store) => store.getAll());
    return (videos || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function saveGuideVideo(video) {
    return useGuideVideoStore("readwrite", (store) => store.put(video));
  }

  function deleteGuideVideo(id) {
    return useGuideVideoStore("readwrite", (store) => store.delete(id));
  }

  function revokeGuideVideoUrls() {
    guideVideoObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    guideVideoObjectUrls = [];
  }

  function guideVideoCard(video, account) {
    const url = URL.createObjectURL(video.blob);
    const owner = account?.email || "";
    const canRemove = owner && video.owner === owner;
    const uploadedAt = new Date(video.createdAt).toLocaleDateString();

    guideVideoObjectUrls.push(url);

    return `
      <article class="guide-video-card">
        <video src="${url}" controls preload="metadata"></video>
        <div>
          <div class="card-row">
            <span class="pill yellow">${escapeHtml(video.grade)}</span>
            <small>${escapeHtml(uploadedAt)}</small>
          </div>
          <h3>${escapeHtml(video.title)}</h3>
          <p>${escapeHtml(video.notes || "Builder showcase upload.")}</p>
          <small>By ${escapeHtml(video.builder)} · ${escapeHtml(roleLabels[video.role] || "Builder")} · ${escapeHtml(formatBytes(video.size))}</small>
          ${canRemove ? `<button class="ghost-btn guide-video-delete" type="button" data-video-id="${escapeHtml(video.id)}">Remove</button>` : ""}
        </div>
      </article>
    `;
  }

  async function drawGuideVideos() {
    const gallery = byId("guideVideoGallery");
    if (!gallery) return;

    gallery.innerHTML = `<div class="empty">Loading build videos...</div>`;

    try {
      const account = currentAccount();
      const videos = await getGuideVideos();
      revokeGuideVideoUrls();

      gallery.innerHTML = videos.length
        ? videos.map((video) => guideVideoCard(video, account)).join("")
        : `<div class="empty">No Gundam build videos uploaded yet.</div>`;

      document.querySelectorAll(".guide-video-delete").forEach((button) => {
        button.addEventListener("click", async () => {
          await deleteGuideVideo(button.dataset.videoId);
          drawGuideVideos();
        });
      });
    } catch (error) {
      console.error("Failed loading guide build videos:", error);
      gallery.innerHTML = `<div class="empty">Video storage is unavailable in this browser session.</div>`;
    }
  }

  function bindGuideVideoFeature() {
    const form = byId("guideVideoForm");
    drawGuideVideos();

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!requireActionAccess(["buyer", "seller"], "upload build videos")) return;

      const file = byId("guideVideoFile")?.files?.[0];
      if (!file || !file.type.startsWith("video/")) {
        alert("Please choose a valid video file.");
        return;
      }

      if (file.size > 100 * 1024 * 1024) {
        alert("Please choose a video under 100 MB for the local demo gallery.");
        return;
      }

      const account = currentAccount();
      const role = currentRole();
      const title = byId("guideVideoTitle").value.trim() || file.name.replace(/\.[^/.]+$/, "");
      const video = {
        id: `build-video-${Date.now()}`,
        title,
        grade: byId("guideVideoGrade").value,
        notes: byId("guideVideoNotes").value.trim(),
        builder: account?.username || account?.email || roleLabels[role],
        owner: account?.email || "",
        role,
        fileName: file.name,
        size: file.size,
        type: file.type,
        createdAt: new Date().toISOString(),
        blob: file
      };

      try {
        await saveGuideVideo(video);
        form.reset();
        await drawGuideVideos();
        openModal(`
          <h2>Build video uploaded</h2>
          <p>${escapeHtml(title)} is now listed in the guide showcase.</p>
          <button class="primary-btn" type="button" id="guideVideoDone">Done</button>
        `);
        byId("guideVideoDone")?.addEventListener("click", closeModal);
      } catch (error) {
        console.error("Failed saving guide build video:", error);
        alert("Unable to save the video in this browser session.");
      }
    });
  }

  function getInventoryOverrides() {
    return read(keys.inventory, {});
  }

  function getProductStock(product) {
    if (product._id) return Number(product.stock);
    const overrides = getInventoryOverrides();
    return Number(overrides[product.id]?.stock ?? product.stock);
  }

  function getProductStatus(product) {
    if (product._id) return product.status;
    const overrides = getInventoryOverrides();
    const manualStatus = overrides[product.id]?.status;
    const stock = getProductStock(product);

    if (manualStatus) return manualStatus;
    if (stock <= 0) return product.status === "Pre-order" ? "Pre-order" : "Out of Stock";
    if (stock <= 5) return "Low Stock";
    if (product.status === "Restock Soon") return "Restock Soon";
    return product.status === "Pre-order" ? "Pre-order" : "Available";
  }

  function setProductInventory(productId, stock, status = "") {
    const overrides = getInventoryOverrides();

    overrides[productId] = {
      ...(overrides[productId] || {}),
      stock: Math.max(0, Number(stock) || 0)
    };

    if (status) {
      overrides[productId].status = status;
    } else {
      delete overrides[productId].status;
    }

    write(keys.inventory, overrides);
  }

  function getSellerReservations() {
    const saved = read(keys.reservations, null);
    if (saved) return saved;

    return getReceipts().slice(0, 4).map((receipt, index) => ({
      id: `RSV-DEMO-${index + 1}`,
      receiptId: receipt.id,
      productId: DATA.products[index % DATA.products.length].id,
      productName: receipt.items.split(",")[0],
      store: receipt.store,
      customer: ["Jared Dela Cruz", "Alex Builder", "Mika Runner", "Demo Buyer"][index % 4],
      status: index === 2 ? "Pre-order" : "For Pickup",
      amount: receipt.amount,
      date: receipt.date
    }));
  }

  function createReservationRecord(product, receipt) {
    const store = DATA.stores.find((item) => item.id === product.storeId);
    const reservations = read(keys.reservations, []);

    reservations.unshift({
      id: `RSV-${receipt.id.replace("GH-", "")}`,
      receiptId: receipt.id,
      productId: product.id,
      productName: product.name,
      store: store?.name || receipt.store,
      customer: "Demo Builder",
      status: getProductStatus(product) === "Pre-order" ? "Pre-order" : "For Pickup",
      amount: receipt.amount,
      date: receipt.date
    });

    write(keys.reservations, reservations);
  }

  function statusClass(status) {
    if (status === "Available") return "green";
    if (status === "Pre-order" || status === "Low Stock" || status === "Restock Soon") return "yellow";
    return "red";
  }

  function productCard(product) {
    const store = DATA.stores.find((item) => item.id === product.storeId);
    const stock = getProductStock(product);
    const status = getProductStatus(product);

    return `
      <article class="product-card">
        <div class="product-art">
          <img src="${escapeHtml(safeProductImage(product.image))}" alt="${escapeHtml(product.name)}">
        </div>

        <div class="product-body">
          <div class="card-row">
            <span class="pill ${statusClass(status)}">${escapeHtml(status)}</span>
            <span class="pill">${escapeHtml(product.grade)}</span>
          </div>

          <h3>${escapeHtml(product.name)}</h3>
          <p>${escapeHtml(product.description || "")}</p>

          <div class="card-row">
            <strong>${money(product.price)}</strong>
            <small>${store?.name || "Local store"} · ${stock} left</small>
          </div>

          <button class="primary-btn reserve-btn" data-id="${escapeHtml(product.id)}" ${status === "Out of Stock" ? "disabled" : ""}>
            ${status === "Pre-order" ? "Pre-order Kit" : "Reserve Kit"}
          </button>
        </div>
      </article>
    `;
  }

  function claimReceipt(receiptId) {
    if (!requireActionAccess(["buyer"], "claim points")) return;

    const receipt = getReceipts().find((item) => item.id === receiptId);
    if (!receipt) return;

    if (claimedIds().includes(receipt.id)) {
      openModal(`<h2>Already claimed</h2><p>This receipt was already used. Points cannot be claimed twice.</p>`);
      return;
    }

    const transactions = getTransactions();
    transactions.unshift({
      id: `TX-${Date.now()}`,
      type: "claim",
      receiptId: receipt.id,
      store: receipt.store,
      points: receipt.points,
      date: new Date().toISOString()
    });
    write(keys.transactions, transactions);
    openModal(`<h2>Points claimed</h2><p>You earned <b>${receipt.points} points</b> from receipt ${receipt.id}.</p><a class="primary-btn" href="points.html">View points</a>`);
  }

  function addReceipt(product) {
    if (!requireActionAccess(["buyer"], "reserve kits")) return;

    const store = DATA.stores.find((item) => item.id === product.storeId);
    const receipt = {
      id: `GH-${Math.floor(100000 + Math.random() * 900000)}`,
      store: store?.name || "Gunpla Hub Partner",
      amount: product.price,
      points: Math.floor(product.price / 10),
      items: product.name,
      date: new Date().toISOString().slice(0, 10)
    };
    const receipts = getReceipts();
    receipts.unshift(receipt);
    write(keys.receipts, receipts);

    createReservationRecord(product, receipt);

    const currentStock = getProductStock(product);
    if (currentStock > 0 && getProductStatus(product) !== "Pre-order") {
      setProductInventory(product.id, currentStock - 1);
    }

    openModal(`
      <h2>Reservation created</h2>
      <p>Your digital receipt <b>${receipt.id}</b> is ready. You may claim ${receipt.points} points from the Receipts page.</p>
      <a class="primary-btn" href="receipts.html">Open receipts</a>
    `);
  }

  function recordSellerSale(item) {
    if (!item) return;

    const receipt = {
      id: `GH-${Math.floor(100000 + Math.random() * 900000)}`,
      store: "Seller Dashboard",
      amount: Number(item.price) || 0,
      points: Math.floor((Number(item.price) || 0) / 10),
      items: item.name,
      date: new Date().toISOString().slice(0, 10),
      source: "seller-offer",
      offerId: item.id,
      category: item.category
    };

    const receipts = getReceipts();
    receipts.unshift(receipt);
    write(keys.receipts, receipts);

    if (item.offerType === "seller-offer") {
      const offers = getSellerOffers().map((offer) => {
        if (offer.id !== item.id) return offer;

        const stock = Math.max(0, Number(offer.stock || 0) - 1);
        return {
          ...offer,
          stock,
          status: stock <= 0 ? (offer.category === "Service" ? "Fully Booked" : "Out of Stock") : offer.status
        };
      });

      setSellerOffers(offers);
    }

    openModal(`
      <h2>Sale recorded</h2>
      <p>${escapeHtml(item.name)} was added as receipt <b>${receipt.id}</b> for ${money(receipt.amount)}.</p>
      <button class="primary-btn" id="sellerSaleDone" type="button">Done</button>
    `);
    byId("sellerSaleDone")?.addEventListener("click", () => {
      closeModal();
      renderSeller();
    });
  }

  function bindReserveButtons() {
    document.querySelectorAll(".reserve-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const product = DATA.products.find((item) => item.id === button.dataset.id);
        if (product) addReceipt(product);
      });
    });
  }

  function renderHome() {
    shell(`
      <section class="hero">
        <div>
          <p class="kicker">Local hobby commerce platform</p>
          <h1>Discover. Build. Claim rewards.</h1>
          <p class="hero-text">Gunpla Hub connects Baguio builders with local stores, live stock labels, digital receipts, QR point claiming, and seller analytics that help stores stock smarter.</p>
          <div class="hero-actions"><a class="primary-btn" href="discover.html">Browse kits</a><a class="ghost-btn" href="beginner-guide.html">Beginner guide</a><a class="ghost-btn" href="seller-dashboard.html">View seller dashboard</a></div>
        </div>
      </section>
      <section class="feature-grid">
        <article><span>01</span>      <h3>Less searching</h3><p>One organized catalog replaces scattered social media posts.</p></article>
        <article><span>02</span>      <h3>Less waste</h3><p>Store analytics help avoid overstocking and missed demand.</p></article>
        <article><span>03</span>      <h3>More trust</h3><p>Receipts, QR confirmation, and store profiles make transactions clearer.</p></article>
      </section>
      <section class="section-head"><div><p class="kicker">Featured kits</p><h2>Built for beginners and collectors</h2></div><a class="ghost-btn" href="discover.html">See all</a></section>
      <section class="product-grid" id="featuredProducts">${DATA.products.slice(0, 3).map(productCard).join("") || `<div class="empty">No kits listed yet.</div>`}</section>
    `);
    bindReserveButtons();
  }

  function renderDiscover() {
    shell(`
      ${titleBlock("Product discovery", "Find the right kit faster", "Search by name, grade, skill level, availability, or local store.")}
      <section class="toolbar"><input id="search" placeholder="Search kits"><select id="grade"><option value="all">All grades</option><option>EG</option><option>HG</option><option>RG</option><option>MG</option><option>PG</option><option>SD</option><option>RE/100</option><option>Other</option></select><select id="skill"><option value="all">All skill levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></section>
      <section class="product-grid" id="products"></section>
    `);

    const draw = () => {
      const search = byId("search").value.toLowerCase();
      const grade = byId("grade").value;
      const skill = byId("skill").value;
      const products = DATA.products.filter((product) => {
        const text = `${product.name} ${product.grade} ${product.skill} ${product.status}`.toLowerCase();
        return text.includes(search) && (grade === "all" || product.grade === grade) && (skill === "all" || product.skill === skill);
      });
      byId("products").innerHTML = products.map(productCard).join("") || `<div class="empty">No kits found.</div>`;
      bindReserveButtons();
    };

    ["search", "grade", "skill"].forEach((id) => byId(id).addEventListener("input", draw));
    draw();
  }

  function renderGuide() {
    const grades = [
      {
        code: "EG",
        name: "Entry Grade",
        scale: "Usually 1/144",
        level: "First kit",
        time: "1 to 2 hours",
        text: "Simple parts, low price, and very little cleanup. Choose this when you want to learn how runners, gates, stickers, and joints work."
      },
      {
        code: "HG",
        name: "High Grade",
        scale: "Usually 1/144",
        level: "Best beginner pick",
        time: "2 to 5 hours",
        text: "The safest starting point for most builders. HG kits are affordable, easy to collect, and detailed enough to practice panel lining and basic cleanup."
      },
      {
        code: "RG",
        name: "Real Grade",
        scale: "Usually 1/144",
        level: "Careful beginner to intermediate",
        time: "5 to 10 hours",
        text: "Small size with high detail. RG kits look impressive, but they use tiny parts and tighter assemblies, so patience matters more than speed."
      },
      {
        code: "MG",
        name: "Master Grade",
        scale: "Usually 1/100",
        level: "Second or third kit",
        time: "8 to 16 hours",
        text: "Larger builds with inner frames and stronger shelf presence. MG is easier to handle than RG in some ways, but it takes more time and space."
      },
      {
        code: "SD",
        name: "Super Deformed",
        scale: "Stylized",
        level: "Casual beginner",
        time: "1 to 3 hours",
        text: "Cute proportions, fewer parts, and quick builds. Good for younger builders or anyone who wants a relaxed desk project."
      },
      {
        code: "PG",
        name: "Perfect Grade",
        scale: "Usually 1/60",
        level: "Advanced",
        time: "20 plus hours",
        text: "Big, expensive, complex, and display-focused. Save this until you know you enjoy long builds and have the tools to clean parts well."
      }
    ];

    const tools = [
      ["Nippers", "Use side cutters made for plastic models. Cut away from the part first, then trim closer."],
      ["Hobby knife", "Shaves tiny nub marks after cutting. Use light pressure and always cut away from your hand."],
      ["Sanding sticks", "Smooth rough nub marks. Start with medium grit, then finish with finer grit."],
      ["Tweezers", "Useful for small stickers, clear pieces, and RG detail parts."],
      ["Panel liner", "Adds shadow into armor grooves. Start lightly and clean excess after it dries."]
    ];

    const steps = [
      ["Read", "Check the manual symbols, runner letters, and part numbers before cutting anything."],
      ["Clip", "Cut each part from the runner with a little plastic gate still attached."],
      ["Clean", "Trim and sand nub marks before assembly so parts sit flush."],
      ["Assemble", "Follow one manual step at a time and avoid forcing tight parts."],
      ["Detail", "Add stickers, panel lines, and simple poses after the main build is stable."],
      ["Display", "Keep spare hands, weapons, and stickers in a small labeled bag or box."]
    ];
    const canUploadVideo = ["buyer", "seller"].includes(currentRole());
    const videoUploadPanel = canUploadVideo
      ? `
        <form class="guide-video-form" id="guideVideoForm">
          <label>Video title<input id="guideVideoTitle" maxlength="80" placeholder="HG Aerial custom build"></label>
          <label>Build grade
            <select id="guideVideoGrade">
              <option>EG</option>
              <option selected>HG</option>
              <option>RG</option>
              <option>MG</option>
              <option>SD</option>
              <option>PG</option>
              <option>Custom</option>
            </select>
          </label>
          <label class="wide">Build notes<textarea id="guideVideoNotes" maxlength="220" placeholder="Paint, panel lining, tools used, or build difficulty"></textarea></label>
          <label class="wide">Build video<input id="guideVideoFile" type="file" accept="video/*" required></label>
          <button class="primary-btn" type="submit">Upload video</button>
        </form>
      `
      : `
        <article class="guide-video-lock">
          <p class="kicker">Buyer or seller access</p>
          <h3>Login to upload a build video</h3>
          <p>Guests can browse the guide, but Gundam build uploads are reserved for buyer and seller accounts.</p>
          <a class="primary-btn" href="login.html">Login or create account</a>
        </article>
      `;

    shell(`
      <section class="guide-hero">
        <div>
          <p class="kicker">Beginner guide</p>
          <h1>Start building with the <span>right grade.</span></h1>
          <p>Learn the difference between EG, HG, RG, MG, and other Gunpla grades, then follow a simple build flow that helps beginners avoid broken parts, stress marks, and wasted money.</p>
          <div class="hero-actions">
            <a class="primary-btn" href="#gradeGuide">Compare grades</a>
            <a class="ghost-btn" href="#buildFlow">Build steps</a>
            <a class="ghost-btn" href="#buildVideos">Build videos</a>
          </div>
        </div>
      </section>

      <section class="section-head" id="gradeGuide">

      </section>

      <section class="guide-grade-grid">
        ${grades.map((grade) => `
          <article class="guide-grade-card">
            <div class="guide-grade-code">${grade.code}</div>
            <div>
              <span class="pill ${grade.code === "HG" || grade.code === "EG" ? "green" : grade.code === "PG" ? "red" : "yellow"}">${grade.level}</span>
              <h3>${grade.name}</h3>
              <p>${grade.text}</p>
              <div class="guide-meta">
                <span>${grade.scale}</span>
                <span>${grade.time}</span>
              </div>
            </div>
          </article>
        `).join("")}
      </section>



      <section class="section-head" id="buildFlow">
        <div>
          <p class="kicker">Build flow</p>
          <h2>A clean way to build</h2>
        </div>
      </section>

      <section class="guide-step-list">
        ${steps.map((step, index) => `
          <article>
            <span>${String(index + 1).padStart(2, "0")}</span>
            <h3>${step[0]}</h3>
            <p>${step[1]}</p>
          </article>
        `).join("")}
      </section>

      <section class="section-head" id="buildVideos">
        <div>
          <p class="kicker">Build showcase</p>
          <h2>Upload Gundam build videos</h2>
        </div>
      </section>

      <section class="guide-video-panel">
        <article class="info-card dark guide-video-uploader">
          <div>
            <p class="kicker">Community upload</p>
            <h3>Share your finished kit or work in progress</h3>
            <p>Buyers and sellers can post short local showcase videos for other builders browsing the beginner guide.</p>
          </div>
          ${videoUploadPanel}
        </article>
        <div class="guide-video-gallery" id="guideVideoGallery">
          <div class="empty">Loading build videos...</div>
        </div>
      </section>

      <section class="guide-columns">
        <article class="info-card dark">
          <p class="kicker">Starter tools</p>
          <h2>What to buy first</h2>
          <div class="guide-tool-list">
            ${tools.map((tool) => `
              <div>
                <b>${tool[0]}</b>
                <p>${tool[1]}</p>
              </div>
            `).join("")}
          </div>
        </article>

        <article class="info-card dark">
          <p class="kicker">Beginner mistakes</p>
          <h2>What to avoid</h2>
          <ul class="guide-checklist">
            <li>Do not twist parts off the runner.</li>
            <li>Do not cut flush against the part on the first cut.</li>
            <li>Do not force pegs if the angle is wrong.</li>
            <li>Do not rush foil stickers around curves.</li>
            <li>Do not start with PG unless you already enjoy long builds.</li>
          </ul>
        </article>
      </section>
    `);
    bindGuideVideoFeature();
  }

  function renderStores() {
    shell(`
      ${titleBlock("Store network", "Local stores with clearer stock visibility", "Find partner shops, specialties, and store details without messaging several sellers first.")}
      <section class="toolbar single"><input id="storeSearch" placeholder="Search store, barangay, specialty"></section>
      <section class="store-grid" id="stores"></section>
    `);

    const draw = () => {
      const query = byId("storeSearch").value.toLowerCase();
      const stores = DATA.stores.filter((store) => `${store.name} ${store.barangay} ${store.specialties.join(" ")}`.toLowerCase().includes(query));
      byId("stores").innerHTML = stores.map((store) => `
        <article class="info-card">
          <div class="card-row"><span class="pill red">${store.barangay}</span><span>★ ${store.rating}</span></div>
          <h3>${store.name}</h3><p>${store.description}</p>
          <small>${store.location}</small>
          <div class="card-row wrap">${store.specialties.map((item) => `<span class="pill">${item}</span>`).join("")}</div>
        </article>`).join("");
    };
    byId("storeSearch").addEventListener("input", draw);
    draw();
  }

  function renderEvents() {
    shell(`${titleBlock("Community events", "Build nights, workshops, and showcases", "RSVP to local activities and encourage builders to join the local scene.")}<section class="event-list" id="events"></section>`);
    const rsvps = read(keys.rsvps, []);
    const isGuest = currentRole() === "guest";
    byId("events").innerHTML = DATA.events.map((event) => {
      const joined = !isGuest && rsvps.includes(event.id);
      return `<article class="event-card"><div class="date-chip"><b>${event.day}</b><span>${event.month}</span></div><div><span class="pill yellow">${event.type}</span><h3>${event.title}</h3><p>${event.description}</p><small>${event.venue}</small></div><button class="${joined ? "ghost-btn" : "primary-btn"} rsvp-btn" data-id="${event.id}">${joined ? "Going" : isGuest ? "Login to RSVP" : "RSVP"}</button></article>`;
    }).join("");
    document.querySelectorAll(".rsvp-btn").forEach((button) => button.addEventListener("click", () => {
      if (!requireActionAccess(["buyer", "seller"], "reserve event seats")) return;

      const list = read(keys.rsvps, []);
      const updated = list.includes(button.dataset.id) ? list.filter((id) => id !== button.dataset.id) : [...list, button.dataset.id];
      write(keys.rsvps, updated);
      renderEvents();
    }));
  }

  function renderReceipts() {
    if (!requirePageAccess(["buyer"])) return;

    shell(`
      ${titleBlock("Digital receipts", "Claim points with one-time receipt records", "Receipts create a clear transaction trail for buyers and useful demand signals for sellers.")}
      <section class="toolbar"><input id="receiptSearch" placeholder="Search receipt or store"><select id="receiptFilter"><option value="all">All receipts</option><option value="ready">Ready</option><option value="claimed">Claimed</option></select><button class="primary-btn" id="sampleReceipt">Create sample</button></section>
      <section class="receipt-list" id="receipts"></section>
    `);

    const draw = () => {
      const query = byId("receiptSearch").value.toLowerCase();
      const filter = byId("receiptFilter").value;
      const claimed = claimedIds();
      const items = getReceipts().filter((receipt) => {
        const status = claimed.includes(receipt.id) ? "claimed" : "ready";
        return `${receipt.id} ${receipt.store} ${receipt.items}`.toLowerCase().includes(query) && (filter === "all" || filter === status);
      });
      byId("receipts").innerHTML = items.map((receipt) => {
        const isClaimed = claimed.includes(receipt.id);
        return `<article class="receipt-card"><div class="receipt-icon">QR</div><div><span class="pill ${isClaimed ? "" : "green"}">${isClaimed ? "Claimed" : "Ready"}</span>      <h3>${escapeHtml(receipt.id)}</h3><p>${escapeHtml(receipt.store)} · ${escapeHtml(receipt.items)}</p><small>${escapeHtml(receipt.date)} · ${money(receipt.amount)} · ${receipt.points} pts</small></div><div class="button-stack"><button class="ghost-btn view-receipt" data-id="${escapeHtml(receipt.id)}">View</button><button class="primary-btn claim-receipt" data-id="${escapeHtml(receipt.id)}" ${isClaimed ? "disabled" : ""}>Claim</button></div></article>`;
      }).join("") || `<div class="empty">No receipts found.</div>`;
      document.querySelectorAll(".claim-receipt").forEach((button) => button.addEventListener("click", () => claimReceipt(button.dataset.id)));
      document.querySelectorAll(".view-receipt").forEach((button) => button.addEventListener("click", () => showReceipt(button.dataset.id)));
    };

    byId("sampleReceipt").addEventListener("click", () => addReceipt(DATA.products[0]));
    ["receiptSearch", "receiptFilter"].forEach((id) => byId(id).addEventListener("input", draw));
    draw();
  }

  function qrPattern(text) {
    let seed = 0;
    for (const char of text) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    return Array.from({ length: 81 }, (_, index) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const finder = index < 18 || index % 9 < 2 || index > 62;
      return `<i class="${finder || seed % 3 === 0 ? "on" : ""}"></i>`;
    }).join("");
  }

  function showReceipt(id) {
    const receipt = getReceipts().find((item) => item.id === id);
    if (!receipt) return;
    openModal(`<div class="qr-modal"><div class="fake-qr">${qrPattern(receipt.id)}</div><div><h2>${escapeHtml(receipt.id)}</h2><p>${escapeHtml(receipt.store)}</p><p>${escapeHtml(receipt.items)}</p><p><b>${money(receipt.amount)}</b> · ${receipt.points} pts</p><button class="primary-btn" id="modalClaim">Claim points</button></div></div>`);
    byId("modalClaim").addEventListener("click", () => claimReceipt(receipt.id));
  }

  function renderScan() {
    if (!requirePageAccess(["buyer"])) return;

    const options = getReceipts().map((receipt) => `<option value="${receipt.id}">${receipt.id} - ${receipt.store}</option>`).join("");
    shell(`${titleBlock("QR scanner", "Prototype receipt validation", "Simulate scanning a digital receipt QR to claim loyalty points once.")}<section class="scan-panel"><div class="scanner"><div class="scan-line"></div><div class="fake-qr large">${qrPattern("scan-demo")}</div></div><div class="info-card dark"><h3>Scan receipt QR</h3><p>Select a receipt below, then validate it like a scanned QR code.</p><select id="scanSelect">${options}</select><button class="primary-btn" id="scanBtn">Validate receipt</button></div></section>`);
    byId("scanBtn")?.addEventListener("click", () => claimReceipt(byId("scanSelect").value));
  }

  function renderPoints() {
    if (!requirePageAccess(["buyer"])) return;

    const balance = pointsBalance();
    const tx = getTransactions();
    shell(`${titleBlock("Points wallet", "Track earned loyalty points", "Points are earned from receipt QR claims and spent on local store rewards.")}<section class="wallet"><div><p class="kicker">Current balance</p><h2>${balance.toLocaleString()} pts</h2><div class="track"><span style="width:${Math.min(100, balance / 10)}%"></span></div><p>${balance >= 1000 ? "Gold Builder" : balance >= 500 ? "Silver Builder" : "Starter Builder"}</p></div><img src="images/model.jpg" alt="Gunpla builder mascot"></section><section class="history-list">${tx.map((item) => `<article><b>+${item.points} pts</b><span>${item.store}</span><small>${item.receiptId} · ${new Date(item.date).toLocaleDateString()}</small></article>`).join("") || `<div class="empty">No point activity yet.</div>`}</section>`);
  }

  function renderRewards() {
    if (!requirePageAccess(["buyer"])) return;

    shell(`${titleBlock("Rewards", "Redeem points for store perks", "Encourage repeat purchases through useful hobby rewards, not random coupons.")}<section class="reward-grid">${DATA.rewards.map((reward) => `<article class="info-card"><span class="pill yellow">${reward.cost} pts</span><h3>${reward.title}</h3><p>${reward.description}</p><small>${reward.store}</small><button class="primary-btn redeem-btn" data-id="${reward.id}">Redeem</button></article>`).join("")}</section>`);
    document.querySelectorAll(".redeem-btn").forEach((button) => button.addEventListener("click", () => {
      const reward = DATA.rewards.find((item) => item.id === button.dataset.id);
      if (pointsBalance() < reward.cost) {
        openModal(`<h2>Not enough points</h2><p>You need ${reward.cost} points to redeem this reward.</p>`);
        return;
      }
      const list = getRedemptions();
      list.unshift({ ...reward, date: new Date().toISOString() });
      write(keys.redemptions, list);
      openModal(`<h2>Reward redeemed</h2><p>${reward.title} has been added to your rewards record.</p>`);
    }));
  }

  async function renderSeller() {
    if (!requirePageAccess(["seller"])) return;

    const sellerAccount = currentAccount();
    let liveProductsList = [];
    
    try {
      const response = await fetch(`${API}/admin/dashboard`, { headers: { Authorization: `Bearer ${sellerAccount.token}` } });
      if (!response.ok) throw new Error("Unable to load your store inventory.");
      liveProductsList = (await response.json()).products;
    } catch (error) {
      shell(`<section class="info-card dark"><h2>Unable to load your store inventory</h2><p>Check your connection and sign in again if your session expired.</p><a class="primary-btn" href="admin-dashboard.html">Open product catalog</a></section>`);
      return;
    }

    const receipts = getReceipts();
    const transactions = getTransactions();
    const redemptions = getRedemptions();
    const reservations = getSellerReservations();
    const sellerOffers = getSellerOffers();
    const sellerOfferReceipts = receipts.filter((receipt) => receipt.source === "seller-offer");
    const offerSales = sellerOfferReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    const serviceSales = sellerOfferReceipts
      .filter((receipt) => receipt.category === "Service")
      .reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
    const lowStockOffers = sellerOffers.filter((offer) => offer.category !== "Service" && Number(offer.stock || 0) <= 3);

    const products = liveProductsList.map((product) => ({
      ...product,
      liveStock: Number(product.stock),
      liveStatus: product.status,
      soldCount: receipts.filter((receipt) =>
        receipt.items.toLowerCase().includes(product.name.toLowerCase())
      ).length
    }));

    const sales = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
    const lowStockProducts = products.filter((product) => product.liveStock <= 5);
    const activeReservations = reservations.filter((item) => item.status !== "Completed");

    const pointLiability = Math.max(
      0,
      transactions.reduce((sum, item) => sum + Number(item.points || 0), 0) -
      redemptions.reduce((sum, item) => sum + Number(item.cost || 0), 0)
    );

    const claimRate = receipts.length ? Math.round((transactions.length / receipts.length) * 100) : 0;

    const salesByDate = receipts.reduce((map, receipt) => {
      map[receipt.date] = (map[receipt.date] || 0) + Number(receipt.amount);
      return map;
    }, {});

    const salesRows = Object.entries(salesByDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6);

    const maxSales = Math.max(1, ...salesRows.map(([, value]) => value));

    const demandRows = products.map((product) => {
      const receiptHits = receipts.filter((receipt) =>
        receipt.items.toLowerCase().includes(product.name.toLowerCase()) ||
        receipt.items.toLowerCase().includes(product.grade.toLowerCase())
      ).length;

      const reservationHits = reservations.filter((item) =>
        item.productId === product.id ||
        item.productName.toLowerCase().includes(product.name.toLowerCase())
      ).length;

      const lowStockBoost = product.liveStock <= 5 ? 18 : 0;
      const preorderBoost = product.liveStatus === "Pre-order" ? 14 : 0;

      return {
        ...product,
        demandScore: receiptHits * 16 + reservationHits * 20 + lowStockBoost + preorderBoost
      };
    }).sort((a, b) => b.demandScore - a.demandScore);

    const topProduct = demandRows[0];

    const restockEstimate = lowStockProducts.reduce((sum, product) => {
      return sum + Math.max(0, 12 - product.liveStock) * product.price;
    }, 0);

    const stockHealth = Math.max(
      0,
      products.length ? Math.round(((products.length - lowStockProducts.length) / products.length) * 100) : 0
    );

    const gradeDemand = ["EG", "HG", "RG", "MG"].map((grade) => {
      const value =
        receipts.filter((receipt) => receipt.items.toLowerCase().includes(grade.toLowerCase())).length +
        products.filter((product) => product.grade === grade && product.liveStock <= 5).length;

      return { grade, value };
    });

    const maxGradeDemand = Math.max(1, ...gradeDemand.map((item) => item.value));

    const actionFor = (product) => {
      if (product.liveStock === 0) return "Move to pre-order or restock now";
      if (product.liveStock <= 3) return "Urgent restock needed";
      if (product.liveStock <= 5) return "Monitor and prepare reorder";
      if (product.soldCount === 0 && product.liveStock >= 12) return "Promote or bundle with tools";
      return "Stock level is healthy";
    };

    shell(`
      ${titleBlock(
        "Seller analytics",
        "Data analytics for sales and inventory",
        "A store-owner page for the capstone emerging technology: analytics that converts receipts, reservations, stock movement, QR claims, rewards, and buyer behavior into restocking decisions."
      )}

      <section class="seller-command">
        <div>
          <p class="kicker">Emerging technology</p>
          <h2>Evidence-based seller control center</h2>
          <p>
            This dashboard follows the manuscript goal: use data analytics to monitor sales performance,
            identify best-selling products, evaluate demand trends, and support inventory decisions.
          </p>
        </div>

        <div class="seller-actions">
          <a class="primary-btn" href="admin-dashboard.html">Add & edit products</a>
          <button class="primary-btn" id="sellerAddSale">Simulate sale + QR receipt</button>
          <button class="ghost-btn" id="sellerResetInventory">Reset stock demo</button>
        </div>
      </section>

      <section class="metric-grid seller-metric-grid">
        <article>
          <span>Total sales</span>
          <b>${money(sales)}</b>
          <small>${receipts.length} digital receipts</small>
        </article>

        <article>
          <span>Active reservations</span>
          <b>${activeReservations.length}</b>
          <small>Reservation and pre-order queue</small>
        </article>

        <article>
          <span>Stock health</span>
          <b>${stockHealth}%</b>
          <small>${lowStockProducts.length} low-stock kits</small>
        </article>

        <article>
          <span>QR claim rate</span>
          <b>${claimRate}%</b>
          <small>${pointLiability.toLocaleString()} points liability</small>
        </article>

        <article>
          <span>Top demand signal</span>
          <b>${topProduct?.grade || "--"}</b>
          <small>${escapeHtml(topProduct?.name || "No product data yet")}</small>
        </article>

        <article>
          <span>Restock budget signal</span>
          <b>${money(restockEstimate)}</b>
          <small>Estimated value to refill low stock to 12 units</small>
        </article>

        <article>
          <span>Tools and services</span>
          <b>${money(offerSales)}</b>
          <small>${sellerOfferReceipts.length} add-on receipts</small>
        </article>

        <article>
          <span>Service revenue</span>
          <b>${money(serviceSales)}</b>
          <small>${sellerOffers.filter((offer) => offer.category === "Service").length} service listings</small>
        </article>

        <article>
          <span>Add-on stock risk</span>
          <b>${lowStockOffers.length}</b>
          <small>Tools or supplies at 3 units or less</small>
        </article>
      </section>

      <section class="seller-offer-panel" id="sellerOffers">
        <div class="seller-panel-head">
          <div>
            <p class="kicker">Other sales</p>
            <h2>Tools, supplies, and services</h2>
            <p>List add-on items like nippers, hobby knives, sanding tools, or paid services such as panel lining and build assistance.</p>
          </div>
          <span class="pill green">${sellerOffers.length} active offers</span>
        </div>

        <form class="seller-offer-form" id="sellerOfferForm">
          <label>Offer name<input id="offerName" required placeholder="Nippers, hobby knife, panel lining"></label>
          <label>Category
            <select id="offerCategory" required>
              <option>Tool</option>
              <option>Supply</option>
              <option>Service</option>
              <option>Add-on</option>
            </select>
          </label>
          <label>Price<input id="offerPrice" required type="number" min="1" placeholder="350"></label>
          <label>Stock / slots<input id="offerStock" required type="number" min="0" placeholder="10"></label>
          <label class="wide">Description<input id="offerDescription" required placeholder="Short seller note for this offer"></label>
          <button class="primary-btn">Add offer</button>
        </form>

        <div class="seller-offer-grid">
          ${sellerOffers.map((offer) => `
            <article class="seller-offer-card">
              <div class="seller-offer-top">
                <span class="pill ${offer.category === "Service" ? "yellow" : Number(offer.stock || 0) <= 3 ? "red" : "green"}">${offer.category}</span>
                <strong>${money(offer.price)}</strong>
              </div>
              <h3>${offer.name}</h3>
              <p>${offer.description}</p>
              <small>${offer.category === "Service" ? `${offer.stock} service slots` : `${offer.stock} units in stock`} Â· ${offer.status}</small>
              <div class="seller-offer-actions">
                <button class="primary-btn seller-offer-sale" type="button" data-id="${offer.id}" ${Number(offer.stock || 0) <= 0 ? "disabled" : ""}>Record sale</button>
                <button class="ghost-btn seller-offer-delete" type="button" data-id="${offer.id}">Remove</button>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="seller-grid">
        <article class="info-card dark seller-panel wide">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Sales trend</p>
              <h3>Daily receipt revenue</h3>
            </div>
            <span class="pill green">Live from receipts</span>
          </div>

          ${
            salesRows.map(([date, value]) => `
              <div class="seller-bar-row">
                <span>${date}</span>
                <div><i style="width:${Math.max(8, (value / maxSales) * 100)}%"></i></div>
                <strong>${money(value)}</strong>
              </div>
            `).join("") || `<div class="empty">No sales data yet.</div>`
          }
        </article>

        <article class="info-card dark seller-panel">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Buyer demand</p>
              <h3>Grade interest</h3>
            </div>
          </div>

          ${
            gradeDemand.map((item) => `
              <div class="seller-bar-row compact">
                <span>${item.grade}</span>
                <div><i style="width:${Math.max(8, (item.value / maxGradeDemand) * 100)}%"></i></div>
                <strong>${item.value}</strong>
              </div>
            `).join("")
          }

          <p class="seller-note">
            Use this to plan beginner-friendly kits, RG/MG collector stock, and tool bundles.
          </p>
        </article>

        <article class="info-card dark seller-panel wide" id="sellerStock">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Inventory visibility</p>
              <h3>Stock movement and restock actions</h3>
            </div>
            <span class="pill yellow">Live Database Connection</span>
          </div>

          <div class="seller-table">
            <div class="seller-table-head">
              <span>Product</span>
              <span>Status</span>
              <span>Stock</span>
              <span>Demand</span>
              <span>Action</span>
            </div>

            ${
              demandRows.map((product) => `
                <form class="seller-table-row seller-stock-form" data-id="${escapeHtml(product.id)}">
                  <span>
                    <b>${escapeHtml(product.name)}</b>
                    <small>${product.grade} · ${product.skill}</small>
                  </span>

                  <span>
                    <em class="pill ${statusClass(product.liveStatus)}">${product.liveStatus}</em>
                  </span>

                  <span>
                    <input name="stock" type="number" min="0" value="${product.liveStock}" aria-label="${escapeHtml(product.name)} stock">
                  </span>

                  <span>
                    <b>${product.demandScore}</b>
                    <small>score</small>
                  </span>

                  <span class="seller-row-actions">
                    <button class="ghost-btn seller-view-product" type="button" data-id="${escapeHtml(product.id)}">View</button>
                    <button class="primary-btn" type="submit">Save</button>
                  </span>
                </form>
              `).join("")
            }
          </div>
        </article>

        <article class="info-card dark seller-panel" id="sellerInsights">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Recommendations</p>
              <h3>Analytics decisions</h3>
            </div>
          </div>

          <ul class="seller-insights">
            <li><b>Restock first:</b> ${escapeHtml(lowStockProducts[0]?.name || "No urgent restock")}</li>
            <li><b>Best demand:</b> ${escapeHtml(topProduct?.name || "No demand data")}</li>
            <li><b>Inventory risk:</b> ${lowStockProducts.length ? `${lowStockProducts.length} products need attention` : "Stock levels are balanced"}</li>
            <li><b>Promotion idea:</b> Bundle tools with HG kits for beginner buyers.</li>
          </ul>
        </article>
      </section>

      <section class="section-head">
        <div>
          <p class="kicker">Capstone features</p>
          <h2>Seller page covers the complete platform flow</h2>
        </div>
      </section>

      <section class="seller-feature-grid">
        <article>
          <span>01</span>
          <h3>Product catalog</h3>
          <p>Manage product names, grades, skill level, prices, tags, and product visibility.</p>
          <a href="discover.html">Open catalog</a>
        </article>

        <article>
          <span>02</span>
          <h3>Inventory visibility</h3>
          <p>Show available, low-stock, pre-order, restock soon, and out-of-stock labels.</p>
          <a href="store.html">Open stores</a>
        </article>

        <article>
          <span>03</span>
          <h3>Reservations</h3>
          <p>Track buyer reservations and pre-orders created from product browsing.</p>
          <a href="receipts.html">Open receipts</a>
        </article>

        <article>
          <span>04</span>
          <h3>QR receipts</h3>
          <p>Use QR confirmation as a transaction record and source of seller analytics.</p>
          <a href="scanqr.html">Open scanner</a>
        </article>

        <article>
          <span>05</span>
          <h3>Points and rewards</h3>
          <p>Measure buyer engagement through loyalty claims and reward redemptions.</p>
          <a href="rewards.html">Open rewards</a>
        </article>

        <article>
          <span>06</span>
          <h3>Events and community</h3>
          <p>Connect local events to demand signals for beginner kits, tools, and supplies.</p>
          <a href="events.html">Open events</a>
        </article>
      </section>

      <section class="seller-grid lower">
        <article class="info-card dark seller-panel">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Reservation queue</p>
              <h3>Pickup and pre-order monitoring</h3>
            </div>
          </div>

          <div class="seller-list">
            ${
              activeReservations.slice(0, 5).map((item) => `
                <div>
                  <span class="pill ${item.status === "Pre-order" ? "yellow" : "green"}">${item.status}</span>
                  <b>${escapeHtml(item.productName)}</b>
                  <small>${item.customer} · ${item.store} · ${item.date}</small>
                </div>
              `).join("") || `<div class="empty">No active reservations.</div>`
            }
          </div>
        </article>

        <article class="info-card dark seller-panel">
          <div class="seller-panel-head">
            <div>
              <p class="kicker">Product requests</p>
              <h3>Demand opportunities</h3>
            </div>
          </div>

          <div class="seller-list">
            ${
              lowStockProducts.map((product) => `
                <div>
                  <span class="pill red">Request</span>
                  <b>${escapeHtml(product.name)}</b>
                  <small>${actionFor(product)}</small>
                </div>
              `).join("") || `
                <div>
                  <span class="pill green">Stable</span>
                  <b>No urgent product request</b>
                  <small>Keep monitoring QR receipts and reservations.</small>
                </div>
              `
            }
          </div>
        </article>
      </section>
    `);

    byId("sellerOfferForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const category = byId("offerCategory").value;
      const offer = {
        id: `offer-${Date.now()}`,
        name: byId("offerName").value.trim(),
        category,
        price: Math.max(1, Number(byId("offerPrice").value) || 0),
        stock: Math.max(0, Number(byId("offerStock").value) || 0),
        status: category === "Service" ? "Bookable" : "Available",
        description: byId("offerDescription").value.trim()
      };

      setSellerOffers([offer, ...getSellerOffers()]);
      renderSeller();
    });

    document.querySelectorAll(".seller-offer-sale").forEach((button) => {
      button.addEventListener("click", () => {
        const offer = getSellerOffers().find((item) => item.id === button.dataset.id);
        if (!offer) return;
        recordSellerSale({ ...offer, offerType: "seller-offer" });
      });
    });

    document.querySelectorAll(".seller-offer-delete").forEach((button) => {
      button.addEventListener("click", () => {
        const offers = getSellerOffers().filter((item) => item.id !== button.dataset.id);
        setSellerOffers(offers);
        renderSeller();
      });
    });

    byId("sellerAddSale")?.addEventListener("click", () => {
      const product = demandRows.find((item) => item.liveStatus !== "Out of Stock") || products[0];
      if (!product) return;

      if (product.liveStock > 0 && product.liveStatus !== "Pre-order") {
        setProductInventory(product.id, product.liveStock - 1, product.liveStatus === "Pre-order" ? "Pre-order" : "");
      }

      recordSellerSale({
        id: product.id,
        name: product.name,
        category: "Kit",
        price: product.price,
        offerType: "product"
      });
    });

    byId("sellerResetInventory")?.addEventListener("click", () => {
      localStorage.removeItem(keys.inventory);
      renderSeller();
    });

    document.querySelectorAll(".seller-stock-form").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const displayId = form.dataset.id; 
        const input = form.querySelector("input[name='stock']");
        const updatedStock = Number(input.value);
        
        const matchedProduct = (typeof liveProductsList !== "undefined" && liveProductsList.find((item) => String(item.id) === String(displayId)))
                               || DATA.products.find((item) => String(item.id) === String(displayId));

        const targetUrlId = matchedProduct?._id || displayId;

        try {
          const response = await fetch(`${API}/products/${targetUrlId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sellerAccount.token}`
            },
            body: JSON.stringify({
              stock: updatedStock,
              status: matchedProduct?.status === "Pre-order" ? "Pre-order" : ""
            })
          });

          if (response.ok) {
            setProductInventory(displayId, updatedStock, matchedProduct?.status === "Pre-order" ? "Pre-order" : "");
            alert("Inventory updated and synchronized successfully!");
            renderSeller();
          } else {
            const responseText = await response.text();
            let serverErrorMessage = responseText;
            try { 
              const parsedJson = JSON.parse(responseText); 
              serverErrorMessage = parsedJson.message || serverErrorMessage;
            } catch(e) {}
            
            alert(`Server rejected update (${response.status}): ${serverErrorMessage}`);
          }
        } catch (error) {
          console.error("Network error communicating with database:", error);
          alert("Network connection error. Check if your backend node application is online.");
        }
      });
    });

    document.querySelectorAll(".seller-view-product").forEach((button) => {
      button.addEventListener("click", () => {
        const product = demandRows.find((item) => item.id === button.dataset.id);
        if (!product) return;

        openModal(`
          <h2>${escapeHtml(product.name)}</h2>
          <p>${escapeHtml(product.description || "")}</p>
          <p><b>Status:</b> ${product.liveStatus} · <b>Stock:</b> ${product.liveStock} · <b>Demand score:</b> ${product.demandScore}</p>
          <p><b>Recommended seller action:</b> ${actionFor(product)}</p>
        `);
      });
    });
  }

  function saveAuthenticatedAccount(data, fallback = {}) {
    const user = data?.user || {};
    const role = normalizeAccountRole(user.role) || normalizeAccountRole(fallback.role) || "buyer";
    const account = {
      username: user.username || fallback.username || "",
      email: user.email || fallback.email || "",
      storeName: user.storeName || fallback.storeName || "",
      storeLocation: user.storeLocation || fallback.storeLocation || "",
      role,
      token: data.token
    };

    write(keys.account, account);
    localStorage.setItem("token", data.token);
    return account;
  }

  function responseMessage(data, fallback) {
    if (typeof data === "string") return data;
    return data?.message || fallback;
  }

  function renderAuth() {
    const activeAccount = currentAccount();

    shell(`
      <section class="auth-card auth-rbac">
        <div class="auth-copy">
          <div class="role-summary">
            <span class="pill ${activeAccount ? "green" : "yellow"}">Current: ${roleLabels[currentRole()]}</span>
            ${activeAccount?.email ? `<small>${activeAccount.email}</small>` : `<small>No account signed in</small>`}
          </div>
          <div class="auth-actions">
            <a class="ghost-btn" id="guestAccess" href="index.html">Continue as Guest</a>
            ${activeAccount ? `<button class="ghost-btn" id="authLogout" type="button">Logout</button>` : ""}
          </div>
        </div>

        <div class="auth-forms">
          <div class="auth-tabs" role="tablist" aria-label="Account access mode">
            <button class="auth-tab active" type="button" data-auth-tab="login">Login</button>
            <button class="auth-tab" type="button" data-auth-tab="register">Create account</button>
          </div>

          <form class="auth-form" id="loginForm">
            <label>Email<input required type="email" id="loginEmail" placeholder="builder@email.com"></label>
            <label>Password<input required type="password" id="loginPassword" placeholder="Password"></label>
            <button class="primary-btn">Login</button>
          </form>

          <form class="auth-form hidden" id="registerForm">
            <label>Account type
              <select id="registerRole" required>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
              </select>
            </label>
            <label>Username<input required type="text" id="registerUsername" placeholder="Gunpla builder"></label>
            <label>Email<input required type="email" id="registerEmail" placeholder="builder@email.com"></label>
            <label>Password<input required minlength="6" type="password" id="registerPassword" placeholder="At least 6 characters"></label>
            <div class="seller-register-fields hidden" id="sellerRegisterFields">
              <label>Store name<input type="text" id="registerStoreName" placeholder="Baguio Hobby Garage"></label>
              <label>Store location<input type="text" id="registerStoreLocation" placeholder="Session Road, Baguio City"></label>
            </div>
            <button class="primary-btn">Create account</button>
          </form>
        </div>
      </section>
    `);

    byId("authLogout")?.addEventListener("click", signOut);
    byId("guestAccess")?.addEventListener("click", () => {
      localStorage.removeItem(keys.account);
      localStorage.removeItem("token");
    });

    const syncSellerRegisterFields = () => {
      const isSeller = byId("registerRole")?.value === "seller";
      const sellerFields = byId("sellerRegisterFields");
      const storeName = byId("registerStoreName");
      const storeLocation = byId("registerStoreLocation");

      sellerFields?.classList.toggle("hidden", !isSeller);
      [storeName, storeLocation].forEach((input) => {
        if (!input) return;
        input.required = isSeller;
        if (!isSeller) input.value = "";
      });
    };

    byId("registerRole")?.addEventListener("change", syncSellerRegisterFields);
    syncSellerRegisterFields();

    document.querySelectorAll(".auth-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const activeTab = button.dataset.authTab;

        document.querySelectorAll(".auth-tab").forEach((item) => {
          item.classList.toggle("active", item.dataset.authTab === activeTab);
        });

        byId("loginForm").classList.toggle("hidden", activeTab !== "login");
        byId("registerForm").classList.toggle("hidden", activeTab !== "register");
      });
    });

    byId("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      // Removed 'role' from payload since backend authenticates by email/password only
      const payload = {
        email: byId("loginEmail").value,
        password: byId("loginPassword").value
      };

      try {
        const response = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          alert(responseMessage(data, "Invalid credentials. Check your email and password."));
          return;
        }

        // Pass data.user instead of payload so it uses the actual database role ('admin', 'seller', or 'buyer')
        const account = saveAuthenticatedAccount(data, data.user);
        openModal(`<h2>${roleLabels[account.role]} login successful</h2><p>Your ${account.role} access is active.</p><a class="primary-btn" href="${roleHome(account.role)}">Continue</a>`);
      } catch (error) {
        console.error("Auth server error:", error);
        alert("Failed to connect to the backend authentication server. Is your node server running on port 5000?");
      }
    });

    byId("registerForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      const payload = {
        role: byId("registerRole").value,
        username: byId("registerUsername").value,
        email: byId("registerEmail").value,
        password: byId("registerPassword").value
      };

      if (payload.role === "seller") {
        payload.storeName = byId("registerStoreName").value.trim();
        payload.storeLocation = byId("registerStoreLocation").value.trim();
      }

      try {
        const response = await fetch(`${API}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          alert(responseMessage(data, "Unable to create account. Check the form and try again."));
          return;
        }

        const account = saveAuthenticatedAccount(data, payload);
        openModal(`<h2>${roleLabels[account.role]} account created</h2><p>Your account is ready and signed in.</p><a class="primary-btn" href="${roleHome(account.role)}">Continue</a>`);
      } catch (error) {
        console.error("Auth server error:", error);
        alert("Failed to connect to the backend authentication server. Is your node server running on port 5000?");
      }
    });
  }

  const pages = {
    home: renderHome,
    discover: renderDiscover,
    guide: renderGuide,
    stores: renderStores,
    events: renderEvents,
    receipts: renderReceipts,
    scan: renderScan,
    points: renderPoints,
    rewards: renderRewards,
    seller: renderSeller,
    login: renderAuth
  };

  function safeProductImage(value) {
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value || "")) return value;
    if (/^\.\.\/images\/[\w.-]+\.(png|jpe?g|webp|gif|svg)$/i.test(value || "")) return value;
    try {
      const url = new URL(value);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch { /* Use a placeholder for unsupported photos. */ }
    return "images/product-placeholder.svg";
  }

  async function startPage() {
    if (["home", "discover"].includes(page)) {
      DATA.products = [];
      (pages[page] || renderHome)();
      const container = byId(page === "home" ? "featuredProducts" : "products");
      container.innerHTML = `<div class="empty" role="status">Loading products…</div>`;
      try {
        const response = await fetch(`${API}/products`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load products");
        DATA.products = await response.json();
      } catch {
        container.innerHTML = `<div class="empty" role="alert">Unable to load products. Check your connection and <button class="ghost-btn" id="retryCatalog">try again</button>.</div>`;
        byId("retryCatalog").addEventListener("click", startPage);
        return;
      }
    }
    (pages[page] || renderHome)();
  }

  document.addEventListener("error", (event) => {
    if (event.target.matches?.(".product-art img") && !event.target.src.endsWith("/product-placeholder.svg")) {
      event.target.src = "images/product-placeholder.svg";
    }
  }, true);
  startPage();
})();
