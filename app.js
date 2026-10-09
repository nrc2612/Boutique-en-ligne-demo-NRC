const brand = document.querySelector('.brand');

if (brand) {
    brand.addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}


// ---------- Catalogue (affichage uniquement : les prix réels sont revérifiés côté serveur) ----------

const PRODUCTS = {
    cloudmax:  { name: 'CloudMax',  price: 230 },
    airwave:   { name: 'AirWave',   price: 190 },
    stormgrip: { name: 'StormGrip', price: 210 },
};

const IMAGE = 'chaussure1-bg.png';
const STORAGE_KEY = 'cart';
const MAX_QTY = 10;

// URL de l'API : utilise ton Worker Cloudflare en production, et le serveur local en dev
const checkoutEndpoint = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:3000/create-checkout-session'
    : 'https://boutique-en-ligne-demo-nrc.marechalucas2612.workers.dev/create-checkout-session';


function loadCart() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (Array.isArray(raw)) {
            return raw.filter(i => PRODUCTS[i.id] && Number.isInteger(i.qty) && i.qty > 0);
        }
    } catch (e) { /* panier corrompu : on repart de zéro */ }
    return [];
}

let cart = loadCart();

function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    updateBadge();
}

const euro = n => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const countItems = () => cart.reduce((sum, i) => sum + i.qty, 0);
const totalPrice = () => cart.reduce((sum, i) => sum + PRODUCTS[i.id].price * i.qty, 0);

function updateBadge() {
    document.querySelectorAll('.cart-count').forEach(el => {
        el.textContent = countItems() > 0 ? countItems() : 'Panier';
    });
}

function addToCart(id) {
    const line = cart.find(i => i.id === id);
    if (line) line.qty = Math.min(line.qty + 1, MAX_QTY);
    else cart.push({ id, qty: 1 });
    saveCart();
}

function changeQty(id, delta) {
    const line = cart.find(i => i.id === id);
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) cart = cart.filter(i => i.id !== id);
    else line.qty = Math.min(line.qty, MAX_QTY);
    saveCart();
    renderCart();
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    renderCart();
}

updateBadge();

// ---------- Page d'accueil : boutons "Ajouter au panier" + popup ----------
const cartPopUp = document.querySelector('.cartPopUP');
let hidePopUpTimer;

document.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
        addToCart(btn.dataset.product);
        if (!cartPopUp) return;
        cartPopUp.classList.remove('hidden');
        clearTimeout(hidePopUpTimer);
        hidePopUpTimer = setTimeout(() => cartPopUp.classList.add('hidden'), 2500);
    });
});

// ---------- Page panier ----------
const itemsList = document.getElementById('cart-items');

function renderCart() {
    if (!itemsList) return;

    const empty = cart.length === 0;
    document.getElementById('cart-empty').classList.toggle('hidden', !empty);
    document.getElementById('cart-layout').classList.toggle('hidden', empty);
    if (empty) return;

    itemsList.innerHTML = cart.map(({ id, qty }) => {
        const p = PRODUCTS[id];
        return `
        <li class="cart-item">
            <img src="${IMAGE}" alt="" class="cart-item-img" draggable="false">
            <div class="cart-item-info">
                <h2>${p.name}</h2>
                <p class="cart-item-unit">${euro(p.price)} l'unité</p>
            </div>
            <div class="qty" role="group" aria-label="Quantité de ${p.name}">
                <button type="button" data-action="minus" data-id="${id}" aria-label="Retirer un ${p.name}"><i class="fa-solid fa-minus"></i></button>
                <span class="qty-value" aria-live="polite">${qty}</span>
                <button type="button" data-action="plus" data-id="${id}" aria-label="Ajouter un ${p.name}" ${qty >= MAX_QTY ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button>
            </div>
            <p class="cart-item-total">${euro(p.price * qty)}</p>
            <button type="button" class="cart-item-remove" data-action="remove" data-id="${id}" aria-label="Supprimer ${p.name} du panier"><i class="fa-solid fa-trash"></i></button>
        </li>`;
    }).join('');

    document.getElementById('cart-subtotal').textContent = euro(totalPrice());
    document.getElementById('cart-total').textContent = euro(totalPrice());
}

if (itemsList) {
    itemsList.addEventListener('click', e => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const { action, id } = btn.dataset;
        if (action === 'plus') changeQty(id, 1);
        if (action === 'minus') changeQty(id, -1);
        if (action === 'remove') removeFromCart(id);
    });

    const checkoutBtn = document.getElementById('checkout-btn');
    const errorMsg = document.getElementById('checkout-error');

    checkoutBtn.addEventListener('click', async () => {
        errorMsg.textContent = '';
        checkoutBtn.disabled = true;
        try {
            const response = await fetch(checkoutEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: cart.map(({ id, qty }) => ({ productId: id, quantity: qty })),
                }),
            });
            const data = await response.json();
            if (data.url) {
                window.location.href = data.url;
                return;
            }
            errorMsg.textContent = data.error || 'Le paiement est indisponible. Réessayez.';
        } catch (err) {
            errorMsg.textContent = 'Connexion au serveur impossible. Vérifiez qu\'il est lancé, puis réessayez.';
        }
        checkoutBtn.disabled = false;
    });

    renderCart();
}
