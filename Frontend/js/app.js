(() => {
  "use strict";

  const DATA = window.GUNPLA_DATA;
  const app = document.getElementById("app");
  const page = document.body.dataset.page || "home";

  const keys = {
    receipts: "gunpla.receipts.v1",
    transactions: "gunpla.transactions.v1",
    redemptions: "gunpla.redemptions.v1",
    account: "gunpla.account.v1",
    inventory: "gunpla.inventory.v1",
    reservations: "gunpla.reservations.v1",
    sellerOffers: "gunpla.sellerOffers.v1"
  };

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
  const API = window.GUNPLA_API_URL || (location.protocol === "file:" || ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
    ? "http://localhost:5000/api"
    : "https://capstone-project-35cd.onrender.com/api");
  let navOutsideCloseBound = false;
  let activeStockMonitor;
  let drawPublicProducts;
  const sellerRevenueSettings = { period: "daily", days: 28 };

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
      { id: "seller-predictions", label: "Predictions", href: "seller-dashboard.html#sellerPredictions" },
      { id: "seller-offers", label: "Offers & Services", href: "seller-dashboard.html#sellerOffers" },
      { id: "seller-stock", label: "Stock Control", href: "seller-dashboard.html#sellerStock" },
      { id: "seller-insights", label: "Insights", href: "seller-dashboard.html#sellerInsights" }
    ];

    const items = publicLinks.map((item) => navItem(item.id, item.label, item.href));

    if (role === "buyer") items.push(navMenu("buyer", "Buyer", buyerLinks));
    if (role === "seller") items.push(navMenu("seller", "Seller", sellerLinks));
    if (role === "admin") {
      items.push(navItem("admin", "Admin dashboard", "admin-dashboard.html"));
      items.push(navItem("video-review", "Video review", "video-review.html"));
    }

    return items.join("");
  }

  function shell(content) {
    activeStockMonitor?.stop();
    activeStockMonitor = null;
    app.innerHTML = `
      <header class="topbar">
        <div class="nav-wrap">
          <a class="brand" href="index.html"><b><span>GUNPLA</span> HUB</b><small>Baguio builders network</small></a>
          <button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks">☰</button>
          <nav class="nav-links" id="navLinks" aria-label="Main navigation">
            ${visibleNavItems()}
          </nav>
          ${accountChip()}
        </div>
      </header>
      <main id="mainContent" class="container">${content}</main>
      <div class="modal" id="modal" aria-hidden="true"><div class="modal-card"><button class="modal-close" id="modalClose">×</button><div id="modalBody"></div></div></div>
    `;

    byId("menuBtn")?.addEventListener("click", () => {
      setMobileMenu(!byId("navLinks").classList.contains("open"));
    });
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
      document.addEventListener("click", (event) => {
        closeNavMenus();
        if (!event.target.closest(".nav-wrap")) setMobileMenu(false);
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeNavMenus();
          if (byId("navLinks")?.classList.contains("open")) {
            setMobileMenu(false);
            byId("menuBtn")?.focus();
          }
        }
      });
      window.matchMedia("(max-width: 980px)").addEventListener("change", () => setMobileMenu(false));
      navOutsideCloseBound = true;
    }

    byId("logoutBtn")?.addEventListener("click", signOut);
    byId("modalClose")?.addEventListener("click", closeModal);
    byId("modal")?.addEventListener("click", (event) => {
      if (event.target.id === "modal") closeModal();
    });
  }

  function setMobileMenu(open) {
    byId("navLinks")?.classList.toggle("open", open);
    byId("menuBtn")?.setAttribute("aria-expanded", String(open));
    byId("menuBtn")?.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (!open) closeNavMenus();
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

  function bindGuideVideoFeature() {
    window.GUNPLA_BUILD_VIDEOS.mountGuide({ api: API, account: currentAccount() });
  }

  function renderVideoReview() {
    if (!requirePageAccess(["admin"])) return;
    shell(
      titleBlock("Admin review", "Monitor build video uploads", "Review submitted videos before publishing. Track the uploader, upload date, file size, and approval status.") +
      '<section class="toolbar video-review-toolbar"><label for="videoReviewFilter">Upload status<select id="videoReviewFilter"><option value="pending">Pending review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="uploading">Uploading</option><option value="awaiting-upload">Waiting for file</option><option value="failed">Failed</option><option value="removed">Withdrawn</option><option value="all">All uploads</option></select></label><button id="refreshVideoReview" type="button" class="ghost-btn">Refresh queue</button><a href="beginner-guide.html#buildVideos" class="ghost-btn">Open public gallery</a></section><p id="videoReviewStatus" role="status"></p><section id="videoReviewList" class="guide-video-gallery" aria-label="Video review queue"></section>'
    );
    window.GUNPLA_BUILD_VIDEOS.mountReview({ api: API, account: currentAccount() });
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
      storeId: product.storeId,
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
      <article class="product-card" data-product-key="${escapeHtml(product._id || product.id)}">
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

  async function recordSellerSale(item) {
    const sale = await window.GUNPLA_SALES.record(API, currentAccount().token, {
      requestId: item.requestId, type: "offer", name: item.name, category: item.category,
      offerId: item.id, quantity: 1, unitPrice: Number(item.price),
      date: window.GUNPLA_SALES.today(), deductStock: false
    });
    setSellerOffers(getSellerOffers().map((offer) => {
      if (offer.id !== item.id) return offer;
      const stock = Math.max(0, Number(offer.stock || 0) - 1);
      return { ...offer, stock, status: stock <= 0 ? (offer.category === "Service" ? "Fully Booked" : "Out of Stock") : offer.status };
    }));
    await renderSeller("Sale " + sale.id + " recorded. Sales analytics have been refreshed.");
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
      <div class="stock-monitor-bar"><p id="publicStockStatus" role="status">Checking stock availability…</p><button type="button" id="publicStockRefresh" class="ghost-btn">Check stock now</button></div>
    `);
    drawPublicProducts = () => {
      byId("featuredProducts").innerHTML = DATA.products.slice(0, 3).map(productCard).join("") || '<div class="empty">No kits listed yet.</div>';
      bindReserveButtons();
    };
    bindReserveButtons();
  }

  function renderDiscover() {
    shell(`
      ${titleBlock("Product discovery", "Find the right kit faster", "Search by name, grade, skill level, availability, or local store.")}
      <section class="toolbar"><input id="search" placeholder="Search kits"><select id="grade"><option value="all">All grades</option><option>EG</option><option>HG</option><option>RG</option><option>MG</option><option>PG</option><option>SD</option><option>RE/100</option><option>Other</option></select><select id="skill"><option value="all">All skill levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></section>
      <section class="product-grid" id="products"></section>
      <div class="stock-monitor-bar"><p id="publicStockStatus" role="status">Checking stock availability…</p><button type="button" id="publicStockRefresh" class="ghost-btn">Check stock now</button></div>
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
    drawPublicProducts = draw;
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
          <label class="wide">Build video<input id="guideVideoFile" type="file" accept="video/mp4,video/webm,video/ogg" required></label>
          <p class="guide-upload-help wide">MP4, WebM, or Ogg, up to 100 MB. An admin must approve your video before it appears publicly.</p>
          <progress id="guideUploadProgress" class="wide" value="0" max="100" aria-label="Video upload progress" hidden></progress>
          <p id="guideUploadStatus" class="wide" role="status"></p>
          <button class="primary-btn" type="submit">Submit for review</button>
        </form>
      `
      : currentRole() === "admin" ? `<article class="guide-video-lock"><h3>Build video review</h3><p>Review pending uploads before publishing them to the gallery.</p><a class="primary-btn" href="video-review.html">Open review queue</a></article>` : `
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
        <div><p class="kicker">Visual field guide</p><h2>Get to know your next build</h2></div>
      </section>

      <div id="guideInfographics"></div>

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
            <p>Buyers and sellers can submit build videos for admin review. Only approved videos appear in the public gallery.</p>
          </div>
          ${videoUploadPanel}
        </article>
        <div class="guide-video-gallery" id="guideVideoGallery">
          <div class="empty">Loading build videos...</div>
        </div>
      </section>

      <section id="guideMyUploads" class="guide-my-uploads" aria-label="My video uploads" hidden></section>

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
    window.GUNPLA_GUIDE_INFOGRAPHICS.mount({ container: byId("guideInfographics"), grades });
    bindGuideVideoFeature();
  }

  function renderStores() {
    shell(`
      ${titleBlock("Store network", "Explore your local hobby stores", "Browse the map, discover partner shops, and explore the area before your next visit.")}
      <section class="toolbar single" aria-label="Find stores">
        <label for="storeSearch" class="store-search-label">Find a store</label>
        <input type="search" id="storeSearch" placeholder="Search store, barangay, specialty" aria-controls="stores" />
      </section>
      <section class="store-map-panel" aria-labelledby="storeMapTitle">
        <div class="store-map-heading">
          <div><span class="pill yellow">Baguio City</span><h2 id="storeMapTitle">Explore the neighborhood</h2><p>Choose a pin or select a shop below to see its area.</p></div>
          <button type="button" class="ghost-btn" id="showAllStores">Show all stores</button>
        </div>
        <div id="storeMap" class="store-map" role="region" aria-label="Map of local store areas in Baguio" aria-describedby="storeMapNote storeMapStatus" tabindex="0"></div>
        <div class="store-map-caption">
          <p id="storeMapNote">Pins show approximate building, street, or neighborhood locations. Check the listed stall or shop address before visiting.</p>
          <p id="storeMapStatus" role="status"></p>
        </div>
      </section>
      <p class="store-results" id="storeResults" role="status"></p>
      <section class="store-grid" id="stores" aria-label="Matching stores"></section>
    `);

    const mapFeature = window.GUNPLA_STORE_MAP;
    const mapContainer = byId("storeMap");
    let selectedId = null;
    const selectStore = (id, moveToMap = false) => {
      selectedId = id;
      byId("stores").querySelectorAll("[data-store-id]").forEach((card) => {
        const selected = card.dataset.storeId === id;
        card.classList.toggle("is-selected", selected);
        card.querySelector(".store-map-btn")?.setAttribute("aria-pressed", String(selected));
      });
      storeMap.selectStore(id);
      if (moveToMap) {
        mapContainer.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
        mapContainer.focus({ preventScroll: true });
      }
    };
    const storeMap = mapFeature.create({ container: mapContainer, status: byId("storeMapStatus"), onSelect: selectStore });
    byId("showAllStores").disabled = !storeMap.available;

    const draw = () => {
      const query = byId("storeSearch").value.trim().toLowerCase();
      const stores = DATA.stores.filter((store) => `${store.name} ${store.barangay} ${store.location} ${store.specialties.join(" ")}`.toLowerCase().includes(query));
      if (!stores.some((store) => store.id === selectedId)) selectedId = null;
      byId("storeResults").textContent = `${stores.length} ${stores.length === 1 ? "store" : "stores"} found${query ? " for your search" : " in Baguio"}`;
      byId("showAllStores").disabled = !storeMap.available || !stores.length;
      byId("stores").innerHTML = stores.map((store) => {
        const urls = mapFeature.links(store);
        const canShowOnMap = storeMap.available && mapFeature.hasCoordinates(store);
        return `
        <article class="info-card store-card" data-store-id="${escapeHtml(store.id)}">
          <div class="card-row"><span class="pill red">${escapeHtml(store.barangay)}</span>${Number.isFinite(store.rating) ? `<span aria-label="Rated ${escapeHtml(store.rating)} out of 5">★ ${escapeHtml(store.rating)}</span>` : ""}</div>
          <h3>${escapeHtml(store.name)}</h3><p>${escapeHtml(store.description)}</p>
          <small>${escapeHtml(store.location)}</small>
          <div class="card-row wrap">${store.specialties.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>
          <div class="store-card-actions">
            ${canShowOnMap
              ? `<button type="button" class="primary-btn store-map-btn" aria-label="View ${escapeHtml(store.name)} on map" aria-controls="storeMap" aria-pressed="false">View on map</button>`
              : `<a class="primary-btn" href="${escapeHtml(urls.map)}" target="_blank" rel="noopener noreferrer">Open map ↗</a>`}
            <a class="ghost-btn" href="${escapeHtml(urls.directions)}" target="_blank" rel="noopener noreferrer" aria-label="Directions to the ${escapeHtml(store.name)} area (opens Google Maps)">Directions ↗</a>
          </div>
          ${urls.streetView ? `<a class="store-street-view" href="${escapeHtml(urls.streetView)}" target="_blank" rel="noopener noreferrer" aria-label="Street View near ${escapeHtml(store.name)} (opens Google Maps)">Street View nearby ↗</a>` : ""}
        </article>`;
      }).join("") || `<div class="empty store-empty"><h3>No stores found</h3><p>Try a different store name, barangay, or specialty.</p><button type="button" class="ghost-btn" id="clearStoreSearch">Clear search</button></div>`;
      storeMap.setStores(stores);
      if (selectedId) selectStore(selectedId);
    };
    byId("stores").addEventListener("click", (event) => {
      const button = event.target.closest(".store-map-btn");
      if (button) selectStore(button.closest("[data-store-id]").dataset.storeId, true);
      if (event.target.closest("#clearStoreSearch")) {
        byId("storeSearch").value = "";
        draw();
        byId("storeSearch").focus();
      }
    });
    byId("showAllStores").addEventListener("click", () => {
      selectedId = null;
      byId("storeSearch").value = "";
      draw();
    });
    byId("storeSearch").addEventListener("input", draw);
    draw();
  }

  function renderEvents() {
    shell(`${titleBlock("Community events", "Build nights, workshops, and showcases", "Explore event schedules, venues, activities, and registration details.")}<section id="events" aria-label="Browse community events"></section>`);
    window.GUNPLA_EVENTS.load({ container: byId("events"), api: API, account: currentAccount(),
      requireRsvpAccess: () => requireActionAccess(["buyer", "seller"], "RSVP to an event") });
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

  function sellerStockRow(product) {
    return `<form class="seller-table-row seller-stock-form" data-id="${escapeHtml(product.id)}" data-current-stock="${product.liveStock}">
      <span><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.grade)} · ${escapeHtml(product.skill)}</small></span>
      <span><em class="pill ${statusClass(product.liveStatus)}">${escapeHtml(product.liveStatus)}</em></span>
      <span><input name="stock" type="number" min="0" max="1000000" step="1" value="${product.liveStock}" aria-label="${escapeHtml(product.name)} stock"></span>
      <span><b>${product.demandScore}</b><small>score</small></span>
      <span class="seller-row-actions"><button class="ghost-btn seller-view-product" type="button" data-id="${escapeHtml(product.id)}">View</button><button class="ghost-btn" type="button" data-stock-reset hidden>Reset</button><button class="primary-btn" type="submit">Save</button></span>
      <span class="stock-row-error" role="alert" hidden></span>
    </form>`;
  }

  async function renderSeller(notice = "") {
    if (!requirePageAccess(["seller"])) return;

    const sellerAccount = currentAccount();
    let liveProductsList = [];
    let storeOwner;
    let recordedSales = [];
    let revenueSales = [];
    
    try {
      const [response, salesResponse] = await Promise.all([
        fetch(`${API}/admin/dashboard`, { headers: { Authorization: `Bearer ${sellerAccount.token}` }, cache: "no-store" }),
        fetch(`${API}/sales?days=366`, { headers: { Authorization: `Bearer ${sellerAccount.token}` }, cache: "no-store" })
      ]);
      if (!salesResponse.ok) throw new Error("Unable to load completed sales.");
      revenueSales = (await salesResponse.json()).sales;
      const today = window.GUNPLA_SALES.today();
      const cutoff = new Date(`${today}T00:00:00Z`);
      cutoff.setUTCDate(cutoff.getUTCDate() - 27);
      recordedSales = revenueSales.filter((sale) => sale.date >= cutoff.toISOString().slice(0, 10) && sale.date <= today);
      if (!response.ok) throw new Error("Unable to load your store inventory.");
      const dashboard = await response.json();
      liveProductsList = dashboard.products;
      storeOwner = dashboard.user;
    } catch (error) {
      shell(`<section class="info-card dark"><h2>Unable to load your store inventory</h2><p>Check your connection and sign in again if your session expired.</p><a class="primary-btn" href="admin-dashboard.html">Open product catalog</a></section>`);
      return;
    }

    const receipts = recordedSales;
    const receiptIds = new Set(receipts.map((receipt) => receipt.id));
    const transactions = getTransactions().filter((transaction) => receiptIds.has(transaction.receiptId));
    const redemptions = [];
    const reservations = getSellerReservations().filter((item) => item.storeId === storeOwner.id);
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
      soldCount: receipts.reduce((sum, receipt) => sum + receipt.lineItems.filter((line) => line.productId === product.id).reduce((quantity, line) => quantity + line.quantity, 0), 0)
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

    const demandRows = products.map((product) => {
      const receiptHits = product.soldCount;

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
        receipts.reduce((sum, receipt) => sum + receipt.lineItems.filter((line) => line.grade === grade).reduce((units, line) => units + line.quantity, 0), 0) +
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
        "Track sales, see where demand is heading, and plan your next restock."
      )}

      <section class="seller-command">
        <div>
          <p class="kicker">Store overview</p>
          <h2>Your next restock, backed by data</h2>
          <p>
            Monitor sales performance, explore product demand, and look ahead with sales and stock predictions.
            Completed sales and inventory are saved to your store. Record a sale below to include it in analytics and predictions.
          </p>
        </div>

        <div class="seller-actions">
          <a class="primary-btn" href="admin-dashboard.html">Add & edit products</a>
          <a class="ghost-btn" href="#sellerPredictions">View predictions</a>
          <a class="primary-btn" href="#sellerSales">Record completed sale</a>
        </div>
      </section>

      <p id="sellerSavedNotice" role="status">${typeof notice === "string" ? escapeHtml(notice) : ""}</p>
      <section class="metric-grid seller-metric-grid">
        <article>
          <span>Sales · last 28 days</span>
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
          <b id="sellerStockHealth">${stockHealth}%</b>
          <small id="sellerLowStockCount">${lowStockProducts.length} low-stock kits</small>
        </article>

        <article>
          <span>QR claim rate</span>
          <b>${claimRate}%</b>
          <small>${pointLiability.toLocaleString()} points liability</small>
        </article>

        <article>
          <span>Top demand signal</span>
          <b id="sellerTopDemandGrade">${topProduct?.grade || "--"}</b>
          <small id="sellerTopDemandName">${escapeHtml(topProduct?.name || "No product data yet")}</small>
        </article>

        <article>
          <span>Restock budget signal</span>
          <b id="sellerRestockEstimate">${money(restockEstimate)}</b>
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

      <section class="seller-sales-panel" id="sellerSales" aria-labelledby="sellerSalesTitle"></section>

      <section class="seller-predictions" id="sellerPredictions" aria-labelledby="sellerPredictionsTitle"></section>

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
        <article class="info-card dark seller-panel wide" id="sellerRevenue" aria-labelledby="receiptRevenueTitle"></article>

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
            <span class="pill yellow">Automatic stock monitoring</span>
          </div>

          <div class="stock-monitor-bar"><p id="sellerStockSync" role="status">Checking stock…</p><button id="sellerStockRefresh" class="ghost-btn" type="button">Check stock now</button></div>
          <div id="sellerStockSnapshot"></div>

          <div class="seller-table">
            <div class="seller-table-head">
              <span>Product</span>
              <span>Status</span>
              <span>Stock</span>
              <span>Demand</span>
              <span>Action</span>
            </div>

            <div id="sellerStockRows">${demandRows.map(sellerStockRow).join("")}</div>
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

          <div class="seller-list" id="sellerRestockActions">
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

    window.GUNPLA_SALES.mount({ container: byId("sellerSales"), products: liveProductsList, receipts: recordedSales, api: API, token: sellerAccount.token,
      onSaved: (sale) => renderSeller(`Sale ${sale.id} recorded. Sales analytics and inventory have been refreshed.`) });

    window.GUNPLA_REVENUE.mount({ container: byId("sellerRevenue"), receipts: revenueSales, storeId: storeOwner.id, settings: sellerRevenueSettings });

    window.GUNPLA_PREDICTIONS.mount({
      container: byId("sellerPredictions"), products: liveProductsList,
      receipts: recordedSales, storeId: storeOwner.id
    });

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
      button.addEventListener("click", async () => {
        const offer = getSellerOffers().find((item) => item.id === button.dataset.id);
        if (!offer) return;
        button.dataset.requestId ||= window.GUNPLA_SALES.requestId();
        button.disabled = true;
        try { await recordSellerSale({ ...offer, requestId: button.dataset.requestId }); }
        catch (error) { byId("sellerSaleStatus").textContent = error.message; button.disabled = false; }
      });
    });

    document.querySelectorAll(".seller-offer-delete").forEach((button) => {
      button.addEventListener("click", () => {
        const offers = getSellerOffers().filter((item) => item.id !== button.dataset.id);
        setSellerOffers(offers);
        renderSeller();
      });
    });

    function bindStockForms() {
      document.querySelectorAll(".seller-stock-form").forEach((form) => {
        const input = form.querySelector("input[name=stock]");
        form.addEventListener("input", () => {
          form.dataset.dirty = String(Number(input.value) !== Number(form.dataset.currentStock));
          form.querySelector("[data-stock-reset]").hidden = form.dataset.dirty !== "true";
        });
        form.querySelector("[data-stock-reset]").addEventListener("click", () => {
          input.value = form.dataset.currentStock;
          form.dataset.dirty = "false";
          form.querySelector("[data-stock-reset]").hidden = true;
          form.querySelector(".stock-row-error").hidden = true;
          activeStockMonitor?.refresh();
        });
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (form.dataset.saving === "true" || !form.reportValidity()) return;
          const product = liveProductsList.find((item) => String(item.id) === form.dataset.id);
          if (!product) return;
          form.dataset.saving = "true";
          const errorNode = form.querySelector(".stock-row-error");
          const buttons = [...form.querySelectorAll("button")];
          buttons.forEach((button) => { button.disabled = true; });
          errorNode.hidden = true;
          try {
            const response = await fetch(API + "/products/" + encodeURIComponent(product._id), {
              method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sellerAccount.token },
              body: JSON.stringify({ stock: Number(input.value), status: product.status === "Pre-order" ? "Pre-order" : "", expectedVersion: product.__v })
            });
            const saved = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(saved.message || "Unable to save stock. Please try again.");
            form.dataset.dirty = "false";
            form.dataset.saving = "false";
            byId("sellerSavedNotice").textContent = "Stock saved for " + product.name + ".";
            await activeStockMonitor?.refresh();
          } catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
          finally { form.dataset.saving = "false"; buttons.forEach((button) => { button.disabled = false; }); }
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
    bindStockForms();

    const applyStock = (snapshot) => {
      const previous = new Map(liveProductsList.map((product) => [String(product._id), product]));
      const previousIds = [...previous.keys()].sort().join(",");
      const nextIds = snapshot.map((product) => String(product._id)).sort().join(",");
      const changed = window.GUNPLA_STOCK_MONITOR.merge(liveProductsList, snapshot);
      if (!changed && previousIds === nextIds) return 0;
      liveProductsList.splice(0, liveProductsList.length, ...snapshot.map((product) => Object.assign(previous.get(String(product._id)) || {}, product)));
      products.splice(0, products.length, ...liveProductsList.map((product) => ({ ...product, liveStock: Number(product.stock), liveStatus: product.status,
        soldCount: receipts.reduce((sum, receipt) => sum + receipt.lineItems.filter((line) => line.productId === product.id).reduce((units, line) => units + line.quantity, 0), 0) })));
      demandRows.splice(0, demandRows.length, ...products.map((product) => ({ ...product,
        demandScore: product.soldCount * 16 + reservations.filter((item) => item.productId === product.id).length * 20 + (product.liveStock <= 5 ? 18 : 0) + (product.liveStatus === "Pre-order" ? 14 : 0)
      })).sort((a, b) => b.demandScore - a.demandScore));
      byId("sellerStockRows").innerHTML = demandRows.map(sellerStockRow).join("");
      bindStockForms();
      window.GUNPLA_STOCK_MONITOR.summary(byId("sellerStockSnapshot"), products);
      const low = products.filter((product) => product.liveStock <= 5);
      byId("sellerStockHealth").textContent = (products.length ? Math.round((products.length - low.length) / products.length * 100) : 0) + "%";
      byId("sellerLowStockCount").textContent = low.length + " low-stock kits";
      byId("sellerRestockEstimate").textContent = money(low.reduce((sum, product) => sum + Math.max(0, 12 - product.liveStock) * product.price, 0));
      byId("sellerTopDemandGrade").textContent = demandRows[0]?.grade || "--";
      byId("sellerTopDemandName").textContent = demandRows[0]?.name || "No product data yet";
      byId("sellerRestockActions").innerHTML = low.map((product) => '<div><span class="pill red">Restock</span><b>' + escapeHtml(product.name) + '</b><small>' + escapeHtml(actionFor(product)) + '</small></div>').join("") || '<div class="empty">No urgent restock needed.</div>';
      const picker = byId("saleProduct");
      const selected = picker.value;
      picker.replaceChildren(...liveProductsList.map((product) => new Option(product.name + " (" + product.id + ")", product._id)));
      if (liveProductsList.some((product) => product._id === selected)) picker.value = selected;
      picker.disabled = !liveProductsList.length;
      byId("sellerSaleForm").querySelector("button[type=submit]").disabled = !liveProductsList.length;
      const chosen = liveProductsList.find((product) => product._id === picker.value);
      byId("saleStockHint").textContent = chosen ? chosen.stock + " units currently in stock." : "No products in your catalog.";
      byId("predictionHorizon").dispatchEvent(new Event("change"));
      return changed || 1;
    };
    window.GUNPLA_STOCK_MONITOR.summary(byId("sellerStockSnapshot"), products);
    activeStockMonitor = window.GUNPLA_STOCK_MONITOR.create({
      url: API + "/admin/stock", token: sellerAccount.token,
      canUpdate: () => !document.querySelector('.seller-stock-form[data-dirty="true"], .seller-stock-form[data-saving="true"]')
        && byId("sellerSaleForm")?.dataset.saving !== "true" && !document.querySelector('.seller-offer-sale:disabled[data-request-id]') && !byId("modal").classList.contains("show"),
      onData: applyStock,
      onState: (state) => {
        byId("sellerStockSync").textContent = window.GUNPLA_STOCK_MONITOR.label(state);
        byId("sellerStockSync").parentElement.dataset.state = state.status;
      }
    });
    byId("sellerStockRefresh").addEventListener("click", () => activeStockMonitor.refresh());
    activeStockMonitor.start();
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

        openModal(`<h2>Registration Successful!</h2><p>${data.message || "Please check your email to verify your account before logging in."}</p><a class="primary-btn" href="login.html">Go to Login</a>`);
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
    "video-review": renderVideoReview,
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

  function bindPublicStockMonitoring() {
    activeStockMonitor = window.GUNPLA_STOCK_MONITOR.create({
      url: API + "/products/stock",
      canUpdate: () => !byId("modal").classList.contains("show"),
      onData: async (snapshot) => {
        const oldIds = DATA.products.map(window.GUNPLA_STOCK_MONITOR.key).sort().join(",");
        const newIds = snapshot.map(window.GUNPLA_STOCK_MONITOR.key).sort().join(",");
        const changed = window.GUNPLA_STOCK_MONITOR.merge(DATA.products, snapshot);
        if (oldIds !== newIds) {
          const response = await fetch(API + "/products", { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (!response.ok) throw new Error("Unable to refresh the catalog.");
          DATA.products = await response.json();
        }
        if (changed || oldIds !== newIds) {
          const focused = document.activeElement.closest?.("[data-product-key]")?.dataset.productKey;
          drawPublicProducts();
          if (focused) [...document.querySelectorAll("[data-product-key]")].find((card) => card.dataset.productKey === focused)?.querySelector(".reserve-btn")?.focus({ preventScroll: true });
        }
        return changed || (oldIds !== newIds ? 1 : 0);
      },
      onState: (state) => {
        byId("publicStockStatus").textContent = window.GUNPLA_STOCK_MONITOR.label(state);
        byId("publicStockStatus").parentElement.dataset.state = state.status;
      }
    });
    byId("publicStockRefresh").addEventListener("click", () => activeStockMonitor.refresh());
    activeStockMonitor.start();
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
    if (["home", "discover"].includes(page)) bindPublicStockMonitoring();
  }

  document.addEventListener("error", (event) => {
    if (event.target.matches?.(".product-art img") && !event.target.src.endsWith("/product-placeholder.svg")) {
      event.target.src = "images/product-placeholder.svg";
    }
  }, true);
  startPage();
})();
