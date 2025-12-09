const API_BASE = "https://audio-pvc-interventions-shadow.trycloudflare.com"; 

const state = {
    user: null,
    rooms: [],
    currentRoom: null,
};


async function apiPost(path, body) {
    const resp = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
    });

    let data = null;
    try {
        data = await resp.json();
    } catch (e) {
        throw new Error("Bad JSON from server");
    }

    if (!resp.ok && data && data.msg) {
        throw new Error(data.msg);
    }
    return data;
}

function showMessage(id, text, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.style.color = isError ? "#ff8f8f" : "#a5a8af";
}

function saveUser(user) {
    state.user = user;
    try {
        localStorage.setItem("smarthome_user", JSON.stringify(user));
    } catch {}
}

function loadUser() {
    try {
        const raw = localStorage.getItem("smarthome_user");
        if (!raw) return null;
        const u = JSON.parse(raw);
        state.user = u;
        return u;
    } catch {
        return null;
    }
}

function clearUser() {
    state.user = null;
    try {
        localStorage.removeItem("smarthome_user");
    } catch {}
}


function showAuthView() {
    document.getElementById("auth-view").classList.remove("hidden");
    document.getElementById("main-view").classList.add("hidden");
}

function showMainView() {
    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("main-view").classList.remove("hidden");
    document.getElementById("user-badge").textContent =
        state.user?.username || "Неизвестно";
    loadRooms();
}


function initTabs() {
    const buttons = document.querySelectorAll(".tab-button");
    const contents = {
        login: document.getElementById("tab-login"),
        register: document.getElementById("tab-register"),
        reset: document.getElementById("tab-reset"),
    };

    buttons.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tab = btn.dataset.tab;
            buttons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            Object.entries(contents).forEach(([name, node]) => {
                node.classList.toggle("hidden", name !== tab);
            });

            showMessage("auth-message", "");
        });
    });
}


async function handleLogin() {
    const username = document.getElementById("login-username").value.trim();
    const password = document.getElementById("login-password").value.trim();

    if (!username || !password) {
        showMessage("auth-message", "Введите логин и пароль", true);
        return;
    }

    try {
        const data = await apiPost("/api/login", { username, password });
        if (!data.ok) {
            showMessage("auth-message", data.msg || "Ошибка входа", true);
            return;
        }
        saveUser(data.user);
        showMessage("auth-message", "Успешный вход");
        showMainView();
    } catch (e) {
        showMessage("auth-message", e.message || "Ошибка сети", true);
    }
}

async function handleRegister() {
    const username = document.getElementById("reg-username").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value.trim();
    const master_key = document.getElementById("reg-master-key").value.trim();

    if (!username || !email || !password) {
        showMessage("auth-message", "Заполните логин, email и пароль", true);
        return;
    }

    try {
        const data = await apiPost("/api/register", {
            username,
            email,
            password,
            master_key: master_key || null,
        });

        if (!data.ok) {
            showMessage("auth-message", data.msg || "Ошибка регистрации", true);
            return;
        }

        saveUser(data.user);
        showMessage("auth-message", "Аккаунт создан, выполняется вход…");
        showMainView();
    } catch (e) {
        showMessage("auth-message", e.message || "Ошибка сети", true);
    }
}
let resetEmailCache = null;

async function handleResetRequest() {
    const email = document.getElementById("reset-email").value.trim();
    if (!email) {
        showMessage("auth-message", "Введите email для сброса", true);
        return;
    }

    try {
        const data = await apiPost("/api/reset_request", { email });
        resetEmailCache = email;
        document.getElementById("reset-step1").classList.add("hidden");
        document.getElementById("reset-step2").classList.remove("hidden");
        showMessage("auth-message", data.msg || "Код отправлен");
    } catch (e) {
        showMessage("auth-message", e.message || "Ошибка сброса", true);
    }
}

async function handleResetConfirm() {
    const code = document.getElementById("reset-code").value.trim();
    const new_password = document
        .getElementById("reset-new-password")
        .value.trim();

    if (!resetEmailCache) {
        showMessage("auth-message", "Сначала запросите код", true);
        return;
    }
    if (!code || !new_password) {
        showMessage("auth-message", "Код и новый пароль обязательны", true);
        return;
    }

    try {
        const data = await apiPost("/api/reset_confirm", {
            email: resetEmailCache,
            code,
            new_password,
        });
        if (!data.ok) {
            showMessage("auth-message", data.msg || "Ошибка смены пароля", true);
            return;
        }

        showMessage("auth-message", "Пароль успешно сменён, войдите заново.");
        // откат на шаг 1
        document.getElementById("reset-step1").classList.remove("hidden");
        document.getElementById("reset-step2").classList.add("hidden");
    } catch (e) {
        showMessage("auth-message", e.message || "Ошибка смены пароля", true);
    }
}

async function loadRooms() {
    if (!state.user) return;
    try {
        const data = await apiPost("/api/rooms", { user_id: state.user.id });
        if (!data.ok) {
            throw new Error(data.msg || "Не удалось загрузить комнаты");
        }
        state.rooms = data.rooms || [];
        renderRooms();
    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки комнат: " + e.message);
    }
}

function renderRooms() {
    const grid = document.getElementById("rooms-grid");
    grid.innerHTML = "";

    for (const room of state.rooms) {
        const card = document.createElement("div");
        card.className = "room-card";
        card.addEventListener("click", () => openRoomModal(room.id));

        const title = document.createElement("div");
        title.className = "room-title";
        title.textContent = room.name;

        const meta = document.createElement("div");
        meta.className = "room-meta";
        meta.textContent = `Устройств: ${room.devices_count ?? 0}`;

        card.appendChild(title);
        card.appendChild(meta);
        grid.appendChild(card);
    }

    const add = document.createElement("div");
    add.className = "add-room-card";
    add.addEventListener("click", () => addRoomDialog());

    const inner = document.createElement("div");
    inner.className = "add-room-card-inner";

    const plus = document.createElement("div");
    plus.className = "add-room-plus";
    plus.textContent = "＋";

    const text = document.createElement("div");
    text.textContent = "Добавить комнату";

    inner.appendChild(plus);
    inner.appendChild(text);
    add.appendChild(inner);
    grid.appendChild(add);
}

async function addRoomDialog() {
    const presets = [
        "Bedroom",
        "LivingRoom",
        "Kitchen",
        "Bathroom",
        "Office",
        "Nursery",
        "Garage",
        "Custom...",
    ];

    let name = prompt(
        "Тип комнаты (можно ввести своё):\n" + presets.join(", ")
    );
    if (!name) return;

    name = name.trim();
    if (name === "Custom..." || name === "Custom.") {
        const custom = prompt("Название комнаты:");
        if (!custom || !custom.trim()) return;
        name = custom.trim();
    }

    try {
        const data = await apiPost("/api/create_room", {
            user_id: state.user.id,
            name,
        });
        if (!data.ok) {
            alert(data.msg || "Не удалось создать комнату");
            return;
        }
        await loadRooms();
    } catch (e) {
        alert("Ошибка создания комнаты: " + e.message);
    }
}


async function openRoomModal(roomId) {
    const room = state.rooms.find((r) => r.id === roomId);
    if (!room) return;

    state.currentRoom = room;
    document.getElementById("room-modal-title").textContent =
        room.name || "Комната";

    document
        .getElementById("room-modal-backdrop")
        .classList.remove("hidden");

    await loadDevicesForCurrentRoom();
}

function closeRoomModal() {
    document.getElementById("room-modal-backdrop").classList.add("hidden");
    state.currentRoom = null;
}

async function loadDevicesForCurrentRoom() {
    if (!state.currentRoom) return;

    const devicesList = document.getElementById("devices-list");
    devicesList.innerHTML = "";

    try {
        const data = await apiPost("/api/room_items", {
            room_id: state.currentRoom.id,
        });
        if (!data.ok) {
            throw new Error(data.msg || "Не удалось загрузить устройства");
        }

        const items = data.items || [];
        if (!items.length) {
            const empty = document.createElement("div");
            empty.textContent =
                "Пока нет устройств. Нажмите «Устройство», чтобы добавить.";
            empty.style.color = "#a5a8af";
            empty.style.fontSize = "13px";
            devicesList.appendChild(empty);
            return;
        }

        for (const it of items) {
            const row = document.createElement("div");
            row.className = "device-row";

            const main = document.createElement("div");
            main.className = "device-main";

            const lbl = document.createElement("div");
            lbl.className = "device-label";
            lbl.textContent = it.label;

            const kind = document.createElement("div");
            kind.className = "device-kind";
            kind.textContent = "(" + it.kind + ")";

            main.appendChild(lbl);
            main.appendChild(kind);

            const actionsWrap = document.createElement("div");
            actionsWrap.className = "device-actions";

            const actions = getActionsForKind(it.kind);
            actions.forEach((act) => {
                const btn = document.createElement("button");
                btn.className = "btn small outline";
                btn.textContent =
                    act === "on"
                        ? "On"
                        : act === "off"
                        ? "Off"
                        : act === "open"
                        ? "Открыть"
                        : act === "close"
                        ? "Закрыть"
                        : act;

                btn.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    sendDeviceAction(it, act);
                });

                actionsWrap.appendChild(btn);
            });

            const delBtn = document.createElement("button");
            delBtn.className = "btn small danger";
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", async (ev) => {
                ev.stopPropagation();
                if (!confirm("Удалить устройство?")) return;
                await deleteDevice(it.id);
            });

            row.appendChild(main);
            row.appendChild(actionsWrap);
            row.appendChild(delBtn);

            devicesList.appendChild(row);
        }
    } catch (e) {
        alert("Ошибка загрузки устройств: " + e.message);
    }
}

function getActionsForKind(kind) {
    const k = (kind || "").toLowerCase();
    if (k === "door") return ["open", "close"];
    if (k === "siren") return ["on"];
    return ["on", "off"];
}

async function sendDeviceAction(item, action) {
    if (!state.user || !state.currentRoom) return;

    const payload = {
        user: state.user.username,
        room: state.currentRoom.name,
        device: item.label,
        kind: item.kind,
        action: action.toLowerCase(),
    };

    try {
        await apiPost("/api/action", payload);
        console.log("→", payload);
    } catch (e) {
        alert("Ошибка отправки команды: " + e.message);
    }
}

async function deleteDevice(itemId) {
    try {
        const data = await apiPost("/api/delete_device", { item_id: itemId });
        if (!data.ok) {
            alert(data.msg || "Не удалось удалить устройство");
            return;
        }
        await loadDevicesForCurrentRoom();
    } catch (e) {
        alert("Ошибка удаления устройства: " + e.message);
    }
}

async function addDeviceDialog() {
    if (!state.currentRoom) return;

    const presets = [
        "Light",
        "Outlet",
        "Door",
        "Siren",
        "Camera",
        "Sensor",
        "Custom...",
    ];
    let kind = prompt(
        "Тип устройства (Light, Outlet, Door, Siren, Camera, Sensor или своё):\n" +
            presets.join(", ")
    );
    if (!kind) return;
    kind = kind.trim();

    if (kind === "Custom..." || kind === "Custom.") {
        const custom = prompt(
            "Тип устройства (англ., например Heater, Fan, Pump):"
        );
        if (!custom || !custom.trim()) return;
        kind = custom.trim();
    }

    const label = prompt("Название устройства (например 'Лампа у кровати'):");
    if (!label || !label.trim()) return;

    try {
        const data = await apiPost("/api/add_device", {
            room_id: state.currentRoom.id,
            kind,
            label: label.trim(),
        });
        if (!data.ok) {
            alert(data.msg || "Не удалось добавить устройство");
            return;
        }
        await loadDevicesForCurrentRoom();
    } catch (e) {
        alert("Ошибка добавления устройства: " + e.message);
    }
}

async function deleteCurrentRoom() {
    if (!state.currentRoom || !state.user) return;
    if (
        !confirm(
            `Удалить комнату «${state.currentRoom.name}» и все её устройства?`
        )
    ) {
        return;
    }

    try {
        const data = await apiPost("/api/delete_room", {
            user_id: state.user.id,
            room_id: state.currentRoom.id,
        });
        if (!data.ok) {
            alert(data.msg || "Не удалось удалить комнату");
            return;
        }
        closeRoomModal();
        await loadRooms();
    } catch (e) {
        alert("Ошибка удаления комнаты: " + e.message);
    }
}

function init() {
    initTabs();

    document
        .getElementById("btn-login")
        .addEventListener("click", handleLogin);
    document
        .getElementById("btn-register")
        .addEventListener("click", handleRegister);

    document
        .getElementById("btn-reset-request")
        .addEventListener("click", handleResetRequest);
    document
        .getElementById("btn-reset-confirm")
        .addEventListener("click", handleResetConfirm);

    document
        .getElementById("btn-logout")
        .addEventListener("click", () => {
            clearUser();
            showAuthView();
        });

    document
        .getElementById("btn-add-room")
        .addEventListener("click", addRoomDialog);

    document
        .getElementById("btn-close-room-modal")
        .addEventListener("click", closeRoomModal);

    document
        .getElementById("room-modal-backdrop")
        .addEventListener("click", (e) => {
            if (e.target.id === "room-modal-backdrop") {
                closeRoomModal();
            }
        });

    document
        .getElementById("btn-add-device")
        .addEventListener("click", addDeviceDialog);

    document
        .getElementById("btn-delete-room")
        .addEventListener("click", deleteCurrentRoom);

    const u = loadUser();
    if (u) {
        showMainView();
    } else {
        showAuthView();
    }
}

document.addEventListener("DOMContentLoaded", init);

