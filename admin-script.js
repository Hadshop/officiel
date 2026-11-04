// --- SÉCURITÉ ---
function checkAuth() {
  if (sessionStorage.getItem("hadshop_admin_token") !== "connected") {
    window.location.href = "admin-login.html";
  }
}

function logout() {
  sessionStorage.removeItem("hadshop_admin_token");

  const toast = document.createElement("div");
  toast.className = "fixed bottom-20 left-1/2 -translate-x-1/2 bg-[#222] text-white px-6 py-3 rounded-full text-sm shadow-xl transition-all duration-300 opacity-0 translate-y-4 z-50 flex items-center gap-2";
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-green-400">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
    Déconnexion réussie...
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove("opacity-0", "translate-y-4");
    toast.classList.add("opacity-100", "translate-y-0");
  }, 50);

  setTimeout(() => {
    window.location.href = "index.html";
  }, 1500);
}

// --- CLIENT SUPABASE (chargé via supabase.js) ---
const sb = window.supabaseClient;

// --- CACHE LOCAL (pour compatibilité et rapidité) ---
let CACHE = {
  products: [],
  orders: [],
  suppliers: [],
  expenses: [],
  settings: {}
};

// --- CHARGEMENT INITIAL ---
async function loadAllData() {
  try {
    const [p, o, s, e, st] = await Promise.all([
      sb.from("products").select("*").order("createdAt", { ascending: false }),
      sb.from("orders").select("*").order("date", { ascending: false }),
      sb.from("suppliers").select("*"),
      sb.from("expenses").select("*").order("date", { ascending: false }),
      sb.from("settings").select("*").eq("id", 1).single()
    ]);
    
    CACHE.products = p.data || [];
    CACHE.orders = o.data || [];
    CACHE.suppliers = s.data || [];
    CACHE.expenses = e.data || [];
    CACHE.settings = st.data || {};
    
    console.log("[Admin] Données chargées depuis Supabase");
  } catch (err) {
    console.error("[Admin] Erreur chargement :", err);
    alert("Erreur de connexion à la base. Vérifie ta connexion internet.");
  }
}

// --- NETTOYAGE DES COMMANDES > 24H ---
async function cleanOldOrders() {
  try {
    const now = new Date();
    const toDelete = CACHE.orders.filter(order => {
      if (order.status !== "Nouvelle demande") return false;
      const hoursDiff = (now - new Date(order.date)) / (1000 * 60 * 60);
      return hoursDiff > 24;
    });
    
    if (toDelete.length > 0) {
      const ids = toDelete.map(o => o.id);
      await sb.from("orders").delete().in("id", ids);
      console.log(`[Admin] ${ids.length} commande(s) ancienne(s) supprimée(s)`);
    }
  } catch (err) {
    console.warn("[Admin] Erreur nettoyage :", err);
  }
}

// --- PRODUITS ---
async function addProduct(product) {
  product.id = Date.now().toString();
  product.createdAt = new Date().toISOString();
  
  const { error } = await sb.from("products").insert([product]);
  if (error) {
    alert("Erreur ajout produit : " + error.message);
    return;
  }
  
  CACHE.products.push(product);
}

async function updateProduct(updatedProduct) {
  const { error } = await sb.from("products").update(updatedProduct).eq("id", updatedProduct.id);
  if (error) {
    alert("Erreur modification produit : " + error.message);
    return;
  }
  
  const index = CACHE.products.findIndex(p => p.id === updatedProduct.id);
  if (index !== -1) CACHE.products[index] = { ...CACHE.products[index], ...updatedProduct };
}

async function deleteProduct(id) {
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) {
    alert("Erreur suppression produit : " + error.message);
    return;
  }
  
  CACHE.products = CACHE.products.filter(p => p.id !== id);
}

// --- COMMANDES ---
const ORDER_STATUSES = ["Nouvelle demande", "Confirmée", "Livrée & Payée"];

function getNextStatuses(currentStatus) {
  const currentIndex = ORDER_STATUSES.indexOf(currentStatus);
  if (currentIndex === -1) return [currentStatus];
  return ORDER_STATUSES.slice(currentIndex);
}

async function updateOrderStatus(orderId, newStatus) {
  const order = CACHE.orders.find(o => o.id === orderId);
  if (!order) return;
  
  if (newStatus === "Confirmée" && !order.stockDeducted) {
    if (order.items && Array.isArray(order.items)) {
      for (const item of order.items) {
        const product = CACHE.products.find(p => p.id === item.productId);
        if (product) {
          const newStock = Math.max(0, product.stock - item.qty);
          await sb.from("products").update({ stock: newStock }).eq("id", product.id);
          product.stock = newStock;
        }
      }
    }
    order.stockDeducted = true;
  }
  
  order.status = newStatus;
  const { error } = await sb.from("orders").update({ status: newStatus, stockDeducted: order.stockDeducted }).eq("id", orderId);
  if (error) {
    alert("Erreur mise à jour commande : " + error.message);
  }
}

// --- FOURNISSEURS ---
async function addSupplier(supplier) {
  supplier.id = Date.now().toString();
  const { error } = await sb.from("suppliers").insert([supplier]);
  if (error) {
    alert("Erreur ajout fournisseur : " + error.message);
    return;
  }
  CACHE.suppliers.push(supplier);
}

async function deleteSupplier(id) {
  const { error } = await sb.from("suppliers").delete().eq("id", id);
  if (error) {
    alert("Erreur suppression fournisseur : " + error.message);
    return;
  }
  CACHE.suppliers = CACHE.suppliers.filter(s => s.id !== id);
}

// --- DÉPENSES ---
async function addExpense(expense) {
  expense.id = Date.now().toString();
  expense.date = new Date().toISOString();
  const { error } = await sb.from("expenses").insert([expense]);
  if (error) {
    alert("Erreur ajout dépense : " + error.message);
    return;
  }
  CACHE.expenses.push(expense);
}

async function deleteExpense(id) {
  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) {
    alert("Erreur suppression dépense : " + error.message);
    return;
  }
  CACHE.expenses = CACHE.expenses.filter(e => e.id !== id);
}

// --- THÈMES ---
const THEMES = {
  bordeaux: {
    name: "Bordeaux Classique",
    description: "Le thème original de la boutique",
    colors: {
      primary: "#6b2a24", "primary-foreground": "#fcf6f5",
      secondary: "#f2dfd9", "muted-foreground": "#8a6a68",
      blush: "#f6e6e3", gold: "#c49a4a",
      background: "#fdfcfb", foreground: "#3b1c1a", border: "#ebd8d4"
    }
  },
  noirOr: {
    name: "Noir & Or",
    description: "Luxe et sophistication",
    colors: {
      primary: "#1a1a1a", "primary-foreground": "#d4af37",
      secondary: "#f0e6d2", "muted-foreground": "#6a6a6a",
      blush: "#f5efe0", gold: "#d4af37",
      background: "#faf6ec", foreground: "#1a1a1a", border: "#d4cbb5"
    }
  },
  pastel: {
    name: "Pastel Doux",
    description: "Féminin et romantique",
    colors: {
      primary: "#8b6b7d", "primary-foreground": "#fefefe",
      secondary: "#f5e6ee", "muted-foreground": "#a893a0",
      blush: "#fdf0f5", gold: "#d4a5c0",
      background: "#fffafc", foreground: "#4a3540", border: "#ead5de"
    }
  },
  emeraude: {
    name: "Vert Émeraude",
    description: "Nature et raffinement",
    colors: {
      primary: "#1e4d3a", "primary-foreground": "#f0f9f4",
      secondary: "#d8e8df", "muted-foreground": "#4a6a5a",
      blush: "#e0f0e6", gold: "#b8933f",
      background: "#f8fbf9", foreground: "#1a3a2a", border: "#c8dcd0"
    }
  }
};

// --- GESTION DU MOT DE PASSE ADMIN ---
function getDefaultPassword(shopName) {
  return (shopName || "HADSHOP").toLowerCase().replace(/\s+/g, "") + "2026";
}

// --- PARAMÈTRES ---
function getSettings() {
  const defaults = {
    whatsapp: "2290191647720",
    shopName: "HADSHOP",
    heroText: "Mode, sacs, parfums & accessoires choisis avec soin.",
    heroLine1: "L'élégance,",
    heroLine2: "tout simplement.",
    heroSubtext: "Sacs, parfums et accessoires sélectionnés pour vous. Choisissez, ajoutez au panier et commandez en un message WhatsApp.",
    theme: "bordeaux",
    adminPassword: "",
    heroImage: "", // ✅ Nouveau champ
    categories: ["Sacs", "Parfums", "Vêtements", "Chaussures", "Bijoux", "Montres", "Gourdes & thermos"]
  };
  
  const merged = { ...defaults, ...(CACHE.settings || {}) };
  
  if (typeof merged.categories === "string") {
    try { merged.categories = JSON.parse(merged.categories); } catch { merged.categories = defaults.categories; }
  }
  
  return merged;
}

async function saveSettings(partialSettings) {
  const current = getSettings();
  const updated = { ...current, ...partialSettings };
  
  updated.id = 1;
  
  const { error } = await sb.from("settings").upsert(updated, { onConflict: "id" });
  if (error) {
    alert("Erreur sauvegarde paramètres : " + error.message);
    return;
  }
  
  CACHE.settings = updated;
}

// --- FINANCES ---
function getFinancialStats() {
  const orders = CACHE.orders;
  const expenses = CACHE.expenses;
  const products = CACHE.products;

  const revenue = orders
    .filter(o => o.status === "Livrée & Payée")
    .reduce((sum, o) => sum + Number(o.total), 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  const costOfGoodsSold = orders
    .filter(o => o.status === "Livrée & Payée")
    .reduce((sum, o) => {
      if (!o.items) return sum;
      return sum + o.items.reduce((itemSum, item) => {
        const prod = products.find(p => p.id === item.productId);
        return itemSum + (prod ? Number(prod.cost) * item.qty : 0);
      }, 0);
    }, 0);

  const netProfit = revenue - costOfGoodsSold - totalExpenses;

  return { revenue, totalExpenses, costOfGoodsSold, netProfit };
}