window.GUNPLA_DATA = {
  products: [
    { id: "GH-103", name: "HG Gundam Aerial Rebuild", grade: "HG", skill: "Beginner", price: 980, stock: 16, status: "Available", storeId: "baguio-station", image: "images/modal3.png", tags: ["First build", "Snap-fit"], description: "A beginner-friendly kit with clean color separation, stable articulation, and low tool requirements." },
    { id: "GH-104", name: "RG Nu Gundam", grade: "RG", skill: "Intermediate", price: 2250, stock: 5, status: "Available", storeId: "runner-gate", image: "images/modal1.png", tags: ["Detailed", "Popular"], description: "A detailed real-grade kit for builders who want more panel lines, decals, and articulation." },
    { id: "GH-102", name: "MG Barbatos", grade: "MG", skill: "Advanced", price: 3200, stock: 0, status: "Pre-order", storeId: "baguio-station", image: "images/modal2.png", tags: ["Inner frame", "Pre-order"], description: "A master-grade build with a visible inner frame and strong display value." },
    { id: "GH-101", name: "HG Calibarn", grade: "HG", skill: "Beginner", price: 1180, stock: 8, status: "Available", storeId: "mecha-corner", image: "images/modal3.png", tags: ["Beginner", "Hot"], description: "A stylish high-grade kit with strong shelf presence and beginner-safe assembly." },
    { id: "GH-105", name: "MG Wing Zero EW", grade: "MG", skill: "Advanced", price: 3900, stock: 0, status: "Restock Soon", storeId: "north-build", image: "images/modal1.png", tags: ["Display", "Restock"], description: "A dramatic display kit for experienced builders looking for a centerpiece model." },
    { id: "GH-106", name: "Entry Grade RX-78-2", grade: "EG", skill: "Beginner", price: 550, stock: 20, status: "Available", storeId: "mecha-corner", image: "images/modal2.png", tags: ["Budget", "First kit"], description: "A low-cost entry kit made for first-time builders and quick weekend builds." }
  ],
  stores: [
    { id: "baguio-station", name: "Baguio Gunpla Station", barangay: "Session Road", rating: 4.9, location: "Session Road, Baguio City", specialties: ["HG", "RG", "MG"], description: "Flagship partner store with wide kit selection, QR receipt support, and weekly restocks." },
    { id: "mecha-corner", name: "Mecha Corner Baguio", barangay: "Bonifacio", rating: 4.8, location: "Bonifacio Street, Baguio City", specialties: ["Beginner kits", "Tools", "Paint"], description: "Beginner-friendly store for students and first-time builders looking for kits and starter tools." },
    { id: "runner-gate", name: "Runner Gate Hobby", barangay: "Bakakeng", rating: 4.7, location: "Bakakeng Road, Baguio City", specialties: ["RG", "MG", "Premium tools"], description: "Collector-focused shop for detailed builds, decals, stands, and premium tools." },
    { id: "north-build", name: "North Build Station", barangay: "Aurora Hill", rating: 4.8, location: "Aurora Hill, Baguio City", specialties: ["Paint", "MG", "Events"], description: "Community-focused hobby store with events, repaint supplies, and build sessions." }
  ],
  events: [
    { id: "event-build-night", title: "Friday Build Night", day: "17", month: "May", type: "Community", venue: "Baguio Gunpla Station", description: "Bring your kit and build with fellow hobbyists. Free workspace and basic tools provided." },
    { id: "event-panel", title: "Beginner Panel Lining Workshop", day: "24", month: "May", type: "Workshop", venue: "Mecha Corner Baguio", description: "Learn panel lining, nub cleanup, and safe tool handling for cleaner builds." },
    { id: "event-showcase", title: "Local Gunpla Showcase", day: "31", month: "May", type: "Competition", venue: "North Build Station", description: "Display custom kits, vote for community favorites, and meet local builders." }
  ],
  rewards: [
    { id: "reward-voucher", title: "P100 Store Voucher", cost: 500, store: "Baguio Gunpla Station", description: "Redeem for PHP 100 off your next purchase." },
    { id: "reward-panel", title: "Free Panel Liner Use", cost: 350, store: "Mecha Corner Baguio", description: "Use store panel lining materials during a build session." },
    { id: "reward-tools", title: "10% Tool Discount", cost: 650, store: "Runner Gate Hobby", description: "Get 10% off selected tools and finishing accessories." },
    { id: "reward-workshop", title: "Workshop Seat Pass", cost: 900, store: "North Build Station", description: "Reserve one seat for a beginner or repainting workshop." }
  ],
  seedReceipts: [
    { id: "GH-428391", store: "Baguio Gunpla Station", amount: 3650, points: 365, items: "HG Aerial, RG Nu Gundam", date: "2026-05-07" },
    { id: "GH-571204", store: "Mecha Corner Baguio", amount: 1820, points: 182, items: "Nippers, Sanding Sticks, HG Calibarn", date: "2026-05-08" },
    { id: "GH-882019", store: "Runner Gate Hobby", amount: 4990, points: 499, items: "MG Barbatos, Decals, Action Base", date: "2026-05-09" }
  ]
};