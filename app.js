let swReg = null;    
let rawPickups = {};
let rawDropoffs = {};
let driverLocationsData = {};
let addressData = {};
let deliveryData = {};
let currentUser = localStorage.getItem('ec_command_user');
let currentMode = 'pickup';
let currentDriverFilter = null;
let mapBoundsInitialized = false;

function initCommandNotifications(userEmail) {
    if ("Notification" in window) {
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                messaging.getToken({ 
                    serviceWorkerRegistration: swReg,
                    vapidKey: "BA1S09dDHyCTLXZfDGckfFdg0kvCyezfgst5eMhe0TnL03C7eHn3yogeC_u20knFpMxFNsHGZHsDjNp0RXjKHfI" 
                }).then((currentToken) => {
                    if (currentToken) {
                        const sanitizedEmail = userEmail.replace(/[.#$\[\]]/g, "");
                        db.ref('command_tokens/' + sanitizedEmail).set({
                            token: currentToken,
                            user: userEmail,
                            updated: firebase.database.ServerValue.TIMESTAMP
                        });
                        console.log("Command Notification Token Updated");
                    }
                }).catch((err) => console.log('Token Error', err));
            }
        });

        messaging.onMessage((payload) => {
            console.log('Foreground Message:', payload);
            const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
            audio.play();
            const alertDiv = document.getElementById('header-alert');
            alertDiv.style.display = 'block';
            alertDiv.innerText = "⚠️ " + payload.notification.title;
            setTimeout(() => { 
                if(!document.getElementById('list-dnd').innerHTML) alertDiv.style.display = 'none'; 
            }, 5000);
        });
    }
}

if (localStorage.getItem('ec_theme') === 'light') {
    document.body.classList.add('light-mode');
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('ec_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

function toggleActiveList() {
    const list = document.getElementById('active-list-container');
    const btn = document.getElementById('toggle-active-btn');
    const dndList = document.getElementById('dnd-list-container');
    const dndBtn = document.getElementById('toggle-dnd-btn');

    if (list.style.display === 'none') {
        list.style.display = 'flex';
        btn.classList.add('btn-pressed');
        // Close DND
        dndList.style.display = 'none';
        dndBtn.classList.remove('btn-pressed');
    } else {
        list.style.display = 'none';
        btn.classList.remove('btn-pressed');
        btn.style.display = 'block';
    }
}

function toggleDNDList() {
    const list = document.getElementById('dnd-list-container');
    const btn = document.getElementById('toggle-dnd-btn');
    const activeList = document.getElementById('active-list-container');
    const activeBtn = document.getElementById('toggle-active-btn');

    if (list.style.display === 'none') {
        list.style.display = 'flex';
        btn.classList.add('btn-pressed');
        // Close Active
        activeList.style.display = 'none';
        activeBtn.classList.remove('btn-pressed');
    } else {
        list.style.display = 'none';
        btn.classList.remove('btn-pressed');
        btn.style.display = 'block';
    }
}

function filterByDriver(name) {
    currentDriverFilter = name;
    renderData();
    
    // Auto open the list when filtering a driver
    document.getElementById('active-list-container').style.display = 'flex';
    document.getElementById('toggle-active-btn').classList.add('btn-pressed');
    // Ensure DND is closed
    document.getElementById('dnd-list-container').style.display = 'none';
    document.getElementById('toggle-dnd-btn').classList.remove('btn-pressed');
    document.getElementById('toggle-active-btn').style.display = 'none';

    const routeBtn = document.getElementById("view-route-btn");
    if(routeBtn) {
        routeBtn.style.display = "inline-block";
        routeBtn.onclick = (e) => viewDriverRoute(name, e);
    }
}

function clearDriverFilter() {
    currentDriverFilter = null;
    const routeBtn = document.getElementById("view-route-btn");
    if(routeBtn) routeBtn.style.display = "none";
    document.getElementById('toggle-active-btn').style.display = 'block';
    
    const label = document.getElementById("selected-driver-label");
    if(label) label.style.display = "none";

    renderData();
}

function attemptLogin() {
    const email = document.getElementById('login-user').value.trim();
    const password = document.getElementById('login-pin').value.trim();
    if(!email || !password) return;
    
    firebase.auth().signInWithEmailAndPassword(email, password)
    .catch(function(error) {
        alert("Login Failed: " + error.message);
    });
}

function formatTime12(ts) {
    if (!ts) return '--:--';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '--:--';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatPhone(input) {
    let x = input.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
    input.value = !x[2] ? x[1] : '(' + x[1] + ')-' + x[2] + (x[3] ? '-' + x[3] : '');
}

function copyField(id) {
    const el = document.getElementById(id);
    if(el) {
        el.select();
        navigator.clipboard.writeText(el.value);
        
        const rect = window.event.target.getBoundingClientRect();
        const prompt = document.createElement("div");
        prompt.innerText = "COPIED TO CLIPBOARD";
        prompt.style.position = "fixed";
        prompt.style.left = (rect.right + 10) + "px";
        prompt.style.top = rect.top + "px";
        prompt.style.background = "var(--active-green)";
        prompt.style.color = "#000";
        prompt.style.padding = "4px 8px";
        prompt.style.fontSize = "10px";
        prompt.style.fontWeight = "900";
        prompt.style.borderRadius = "4px";
        prompt.style.zIndex = "10000";
        prompt.style.pointerEvents = "none";
        prompt.style.boxShadow = "0 2px 10px rgba(0,0,0,0.5)";
        prompt.style.opacity = "0";
        prompt.style.transition = "opacity 0.3s, transform 0.3s";
        
        document.body.appendChild(prompt);
        
        requestAnimationFrame(() => {
            prompt.style.opacity = "1";
            prompt.style.transform = "translateX(5px)";
        });

        setTimeout(() => {
            prompt.style.opacity = "0";
            prompt.style.transform = "translateX(10px)";
            setTimeout(() => document.body.removeChild(prompt), 300);
        }, 1500);
    }
}

// MAP LOGIC
let mainMap;
let mapMarkers = {};
let activePolyline = null;
let listeningRef = null;
let mapAllListener = null;

function openMap() {
    document.getElementById('map-driver-head').style.display = 'none';
    mapBoundsInitialized = false;
    document.getElementById('map-modal').style.display = 'block';
    document.getElementById('route-time-badge').style.display = 'none';
    currentDriverFilter = null;
    
    setTimeout(() => {
            if(mainMap) google.maps.event.trigger(mainMap, "resize");
    }, 100);

    if (!mainMap) {
        mainMap = new google.maps.Map(document.getElementById("map"), {
            gestureHandling: "greedy",
            styles: [ { "featureType": "all", "elementType": "all", "stylers": [{ "invert_lightness": true }, { "saturation": 10 }, { "lightness": 30 }, { "gamma": 0.5 }, { "hue": "#435158" }] } ]
        });
    }
    
    for(let k in mapMarkers) { if(mapMarkers[k]) mapMarkers[k].setMap(null); }
    mapMarkers = {};
    if(activePolyline) { activePolyline.setMap(null); activePolyline = null; }
    if(mapAllListener) db.ref('driver_locations').off('value', mapAllListener);
    
    mapAllListener = db.ref('driver_locations').on('value', (snapshot) => {
        const drivers = snapshot.val();
        const bounds = new google.maps.LatLngBounds();
        let hasDrivers = false;

        for (let name in drivers) {
            const driver = drivers[name];
            const pos = { lat: driver.lat, lng: driver.lng };
            const updateTS = driver.gps_timestamp || driver.timestamp || driver.last_seen;
            const timeStr = formatTime12(updateTS);
            const d = new Date(updateTS);
            const dateStr = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
            const markerLabelText = `${name}\n${timeStr} | ${dateStr}`;
            
            bounds.extend(pos);
            hasDrivers = true;

            if (mapMarkers[name]) {
                mapMarkers[name].setPosition(pos);
                mapMarkers[name].setLabel({ text: markerLabelText, className: "pulsing-dot driver-map-label" });
            } else {
                mapMarkers[name] = new google.maps.Marker({
                    position: pos, map: mainMap,
                    icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: '#00b32d', fillOpacity: 1, strokeWeight: 2, strokeColor: '#ffffff', scale: 7, labelOrigin: new google.maps.Point(0, -2) },
                    label: { text: markerLabelText, className: "pulsing-dot driver-map-label" },
                    title: name
                });
            }
        }
        if (hasDrivers && !mapBoundsInitialized) {
            mainMap.fitBounds(bounds);
            mapBoundsInitialized = true;
            google.maps.event.addListenerOnce(mainMap, 'idle', () => { if (mainMap.getZoom() > 16) mainMap.setZoom(16); });
        }
    });
}

function viewDriverRoute(name, e) {
    if(e) e.stopPropagation();
    mapBoundsInitialized = false;
    
    if(mapAllListener) {
        db.ref('driver_locations').off('value', mapAllListener);
        mapAllListener = null;
    }

    currentDriverFilter = name;
    document.getElementById('map-modal').style.display = 'block';
    
    if (!mainMap) {
        mainMap = new google.maps.Map(document.getElementById("map"), {
            gestureHandling: "greedy",
            styles: [ { "featureType": "all", "elementType": "all", "stylers": [{ "invert_lightness": true }, { "saturation": 10 }, { "lightness": 30 }, { "gamma": 0.5 }, { "hue": "#435158" }] } ]
        });
    }
    
    renderData();
    setTimeout(() => google.maps.event.trigger(mainMap, "resize"), 100);
}

function closeMap() {
    mapBoundsInitialized = false;
    document.getElementById('map-modal').style.display = 'none';
    document.getElementById('map-driver-head').style.display = 'none';
    
    if(mapAllListener) {
        db.ref('driver_locations').off('value', mapAllListener);
        mapAllListener = null;
    }
    
    if(activePolyline) { activePolyline.setMap(null); activePolyline = null; }
    for(let k in mapMarkers) {
            if(mapMarkers[k]) mapMarkers[k].setMap(null);
    }
    mapMarkers = {};
}

function zoomToDensest() {
    // Zoom Quick - Fit all visible drivers/points
    const bounds = new google.maps.LatLngBounds();
    let found = false;
    Object.keys(mapMarkers).forEach(k => {
            if(mapMarkers[k].getPosition()) {
                bounds.extend(mapMarkers[k].getPosition());
                found = true;
            }
    });
    if(activePolyline) {
        activePolyline.getPath().forEach(p => bounds.extend(p));
        found = true;
    }
    if(found) mainMap.fitBounds(bounds);
}

function zoomToAll() {
    // Zoom Out - All points + buffer
    const bounds = new google.maps.LatLngBounds();
    let found = false;
    Object.keys(mapMarkers).forEach(k => {
        if(mapMarkers[k].getPosition()) {
            bounds.extend(mapMarkers[k].getPosition());
            found = true;
        }
    });
    if(activePolyline) {
        activePolyline.getPath().forEach(p => bounds.extend(p));
        found = true;
    }
    if(found) {
            mainMap.fitBounds(bounds);
            const listener = google.maps.event.addListenerOnce(mainMap, 'idle', () => {
                mainMap.setZoom(mainMap.getZoom() - 1); // Zoom out one level
            });
    }
}

const alertSound = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

function requestNotifyPermission() {
    if ("Notification" in window) Notification.requestPermission();
}

function updateClock() { document.getElementById('clock').innerText = formatTime12(new Date()); }
setInterval(updateClock, 1000); updateClock();

function setMode(mode) {
    currentMode = mode;
    const top = document.getElementById('top-input-section');
    const bot = document.getElementById('bottom-input-section');
    const grpPickup = document.getElementById('group-pickup');
    const grpDrop = document.getElementById('group-drop');
    const btnPickup = document.getElementById('btn-mode-pickup');
    const btnDelivery = document.getElementById('btn-mode-delivery');

    if(mode === 'pickup') {
        top.appendChild(grpPickup);
        bot.appendChild(grpDrop);
        btnPickup.classList.add('active-mode');
        btnDelivery.classList.remove('active-mode', 'delivery-mode');
    } else {
        top.appendChild(grpDrop);
        bot.appendChild(grpPickup);
        btnPickup.classList.remove('active-mode');
        btnDelivery.classList.add('active-mode', 'delivery-mode');
    }
}

// Initialize Mode
setMode('pickup');

firebase.auth().onAuthStateChanged((user) => {
    if(user) {
        const allowedAdmins = ["desirae@ec.com", "celeste@ec.com"];
        if (!allowedAdmins.includes(user.email)) {
            alert("ACCESS DENIED: You are not authorized to access the Command Console.");
            firebase.auth().signOut();
            document.getElementById('login-overlay').style.display = 'flex';
            return;
        }
        currentUser = user.email.split('@')[0];
        initCommandNotifications(user.email);
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('user-display').innerText = `Logged in as: ${currentUser}`;
        
        db.ref("address_lookup").on("value", snap => { addressData = snap.val() || {}; });
        
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        db.ref("pickups").orderByChild("timestamp").startAt(sevenDaysAgo).on("value", snapshot => {
            rawPickups = snapshot.val() || {};
            renderData();
        });

        db.ref("dropoffs").orderByChild("timestamp").startAt(sevenDaysAgo).on("value", snapshot => {
            rawDropoffs = snapshot.val() || {};
            renderData();
        });

        db.ref("driver_locations").on("value", snapshot => {
            driverLocationsData = snapshot.val() || {};
            renderData();
        });
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
});

function handleSearchKey(e) {
    if (e.key === "Enter") {
        e.target.blur();
        document.getElementById('board-panel').scrollIntoView({ behavior: 'smooth' });
    }
}

function resetFormFields() {
    ['f-city', 'f-pickup', 'f-drop-name', 'f-drop-address', 'f-drop-city', 'f-po', 'f-info', 'f-name', 'f-pkg-details', 'f-customer-email-p', 'f-customer-email-d', 'f-customer-phone-p', 'f-customer-phone-d'].forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.value = "";
            // Reset styling if it was a link field (though this only applies to edit modal, form is fine)
        }
    });
}

function startVoiceEntry() {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return alert("Voice API not supported");
    
    const rec = new Speech();
    rec.lang = 'en-US';
    rec.start();
    
    const icon = document.getElementById('mic-icon');
    icon.classList.add('voice-active');
    
    rec.onresult = (e) => {
        let cmdStr = e.results[0][0].transcript.toLowerCase();
        if (cmdStr.trim() === "dispatch") { createJob(); return; }
        
        // Basic number conversion
        const numWords = { 'one':1, 'two':2, 'three':3, 'four':4, 'five':5, 'six':6, 'seven':7, 'eight':8, 'nine':9, 'ten':10 };
        Object.keys(numWords).forEach(word => {
            const reg = new RegExp(`\\b${word}\\b`, 'g');
            cmdStr = cmdStr.replace(reg, numWords[word]);
        });

        // Logic to populate fields (simplified for merged app)
        let drvMatch = cmdStr.match(/\bfor\s+(matt|touch|julian|jess|alysha|kayla)\b/);
        if (cmdStr.trim() === "dispatch") { createJob(); return; }
        if (drvMatch) {
            let dName = drvMatch[1].charAt(0).toUpperCase() + drvMatch[1].slice(1);
            document.getElementById('f-driver').value = dName;
        }
    };
    
    rec.onend = () => { icon.classList.remove('voice-active'); };
}

function handleNameInput(val) {
    const box = document.getElementById('suggestions');
    if(val.length < 1) { box.style.display = 'none'; return; }
    const matches = Object.keys(addressData).filter(k => k.toLowerCase().startsWith(val.toLowerCase()));
    if(matches.length === 0) { box.style.display = 'none'; return; }
    box.innerHTML = matches.map(k => `<div class="suggestion-item" onclick="selectClient('${k}')">${k}</div>`).join('');
    box.style.display = 'block';
}

function selectClient(name) {
    const data = addressData[name];
    if(!data) return;
    document.getElementById('f-name').value = name;
    document.getElementById('f-pickup').value = data.address || "";
    document.getElementById('f-city').value = data.city || "";
    if(data.customer_email) document.getElementById('f-customer-email-p').value = data.customer_email;
    if(data.customer_phone) document.getElementById('f-customer-phone-p').value = data.customer_phone;
    document.getElementById('suggestions').style.display = 'none';
    document.getElementById('city-suggestions-p').style.display = 'none';
}

function handleDropNameInput(val) {
    const box = document.getElementById('drop-suggestions');
    if(val.length < 1) { box.style.display = 'none'; return; }
    const matches = Object.keys(addressData).filter(k => k.toLowerCase().startsWith(val.toLowerCase()));
    if(matches.length === 0) { box.style.display = 'none'; return; }
    box.innerHTML = matches.map(k => `<div class="suggestion-item" onclick="selectDropClient('${k}')">${k}</div>`).join('');
    box.style.display = 'block';
}

function selectDropClient(name) {
    const data = addressData[name];
    if(!data) return;
    document.getElementById('f-drop-name').value = name;
    document.getElementById('f-drop-address').value = data.address || "";
    document.getElementById('f-drop-city').value = data.city || "";
    if(data.customer_email) document.getElementById('f-customer-email-d').value = data.customer_email;
    if(data.customer_phone) document.getElementById('f-customer-phone-d').value = data.customer_phone;
    document.getElementById('drop-suggestions').style.display = 'none';
    document.getElementById('city-suggestions-d').style.display = 'none';
}

function handleCityInput(val, type) {
    const boxId = type === 'pickup' ? 'city-suggestions-p' : 'city-suggestions-d';
    const box = document.getElementById(boxId);
    if(val.length < 1) { box.style.display = 'none'; return; }
    const matches = Object.keys(addressData).filter(k => {
        const city = addressData[k].city || "";
        return city.toLowerCase().startsWith(val.toLowerCase());
    });
    if(matches.length === 0) { box.style.display = 'none'; return; }
    const fn = type === 'pickup' ? 'selectClient' : 'selectDropClient';
    box.innerHTML = matches.map(k => `<div class="suggestion-item" onclick="${fn}('${k}')">${k} (${addressData[k].city})</div>`).join('');
    box.style.display = 'block';
}

function archiveAllDND() {
    if(!confirm("Archive ALL active DND/DNP jobs?")) return;
    const updates = {};
    const ts = firebase.database.ServerValue.TIMESTAMP;
    
    const check = (list, node) => {
        Object.keys(list).forEach(id => {
            const job = list[id];
            const infoLower = (job.other_info || "").toLowerCase();
            if(job.status !== 'completed' && (infoLower.includes("dnd") || infoLower.includes("dnp"))) {
                updates[`/${node}/${id}/status`] = 'completed';
                updates[`/${node}/${id}/completed_at`] = ts;
                updates[`/${node}/${id}/last_edit_by`] = currentUser;
                updates[`/${node}/${id}/other_info`] = "[ARCHIVED ALL] " + job.other_info;
            }
        });
    };
    
    check(rawPickups, 'pickups');
    check(rawDropoffs, 'dropoffs');
    
    if(Object.keys(updates).length > 0) db.ref().update(updates);
    
    // Close list immediately
    const list = document.getElementById('dnd-list-container');
    const btn = document.getElementById('toggle-dnd-btn');
    if(list.style.display !== 'none') {
            list.style.display = 'none';
            btn.classList.remove('btn-pressed');
            btn.style.display = 'block';
    }
}

function createJob() {
    const pickup = document.getElementById('f-pickup').value;
    const dropAddr = document.getElementById('f-drop-address').value;
    const dropCity = document.getElementById('f-drop-city').value;
    const drop = dropAddr;
    const city = document.getElementById('f-city').value;
    const name = document.getElementById('f-name').value;
    const dropName = document.getElementById('f-drop-name').value;
    const assigned = document.getElementById('f-driver').value;
    const infoRaw = document.getElementById('f-info').value;
    const info = infoRaw ? `[${currentUser}]: ${infoRaw}` : "";
    const email = currentMode === 'pickup' ? document.getElementById('f-customer-email-p').value : document.getElementById('f-customer-email-d').value;
    const phone = currentMode === 'pickup' ? document.getElementById('f-customer-phone-p').value : document.getElementById('f-customer-phone-d').value;

    if(!(name && pickup && city) && !(dropName && dropAddr && dropCity)) return alert("Please complete either the full Pickup section or full Delivery section.");

    const jobData = {
        city: city || dropCity, pickup_location: pickup, destination: drop,
        delivery_name: dropName,
        package_details: document.getElementById('f-pkg-details').value,
        po_number: document.getElementById('f-po').value,
        name: name,
        other_info: info,
        customer_email: email || "",
        customer_phone: phone || "",
        status: 'pending', 
        assigned_to: assigned, 
        timestamp: Date.now(),
        created_by: currentUser,
        last_edit_by: currentUser
    };

    const targetNode = currentMode === 'pickup' ? 'pickups' : 'dropoffs';
    db.ref(targetNode).push(jobData);
    
    // Save addresses for autosuggest
    if(name) db.ref("address_lookup").child(name.replace(/[.#$\[\]\/]/g, "").trim()).set({ address: pickup, city: city, customer_email: email || "", customer_phone: phone || "", last_edit_by: currentUser });
    if(dropName) db.ref("address_lookup").child(dropName.replace(/[.#$\[\]\/]/g, "").trim()).set({ address: document.getElementById('f-drop-address').value, city: document.getElementById('f-drop-city').value, customer_email: email || "", customer_phone: phone || "", last_edit_by: currentUser });

    resetFormFields();
    // document.getElementById('f-driver').value = "Unassigned";
}

let pressTimer;
function startPress(el) {
    pressTimer = setTimeout(() => {
        el.readOnly = false;
        el.style.color = 'var(--text)';
        el.style.textDecoration = 'none';
        el.style.cursor = 'text';
        el.focus();
        if(navigator.vibrate) navigator.vibrate(50);
    }, 1500);
}
function cancelPress() { clearTimeout(pressTimer); }
function handleLinkClick(el, type) {
    if(el.readOnly && el.value) {
        window.location.href = (type === 'email' ? 'mailto:' : 'tel:') + el.value;
    }
}

function viewDetails(id, type) {
    const isPickup = type === 'pickup';
    const data = isPickup ? rawPickups[id] : rawDropoffs[id];
    if(!data) return;

    const val = (v) => v ? v.replace(/"/g, '&quot;') : "";
    const drivers = ['Unassigned', 'Matt', 'Touch', 'Julian', 'Jess', 'Alysha', 'Kayla'];
    const driverOpts = drivers.map(d => `<option value="${d}" ${data.assigned_to === d ? 'selected' : ''}>${d}</option>`).join('');

    // UPDATED: EDIT FORM STRUCTURE TO MATCH MAIN DISPATCH FORM EXACTLY
    const html = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div style="font-weight:800; font-size:16px; color:var(--accent); text-transform:uppercase;">EDIT ${isPickup?'PICKUP':'DELIVERY'}</div>
            <div style="display:flex;">
                <button onclick="archiveAsFailed('${id}', '${type}')" style="background:var(--accent); color:#000; border:none; padding:8px 14px; font-weight:700; cursor:pointer; font-size:12px; border-radius:4px; margin-right:10px;">ARCHIVE</button>
                <button onclick="deleteJob('${id}', '${type}')" style="background:transparent; border:1px solid #b71c1c; color:#ff5555; padding:8px 14px; font-weight:700; cursor:pointer; font-size:12px; border-radius:4px;">DELETE</button>
            </div>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:0;">
            <div class="input-wrap" style="margin-bottom:12px;">
                <input id="e-name" value="${val(data.name)}" placeholder="Pickup Business/Contact Name" style="margin-bottom:0; width:100%;">
                <button class="copy-btn" onclick="copyField('e-name')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>
            <div class="flex-row">
                <div class="input-wrap" style="flex:2;">
                    <input id="e-pickup" value="${val(data.pickup_location)}" placeholder="Pickup Address" style="margin-bottom:0; width:100%;">
                    <button class="copy-btn" onclick="copyField('e-pickup')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
                <div class="input-wrap" style="flex:1;">
                    <input id="e-city-p" value="${val(data.city)}" placeholder="City" style="margin-bottom:0; width:100%;">
                    <button class="copy-btn" onclick="copyField('e-city-p')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
            </div>
            <div class="flex-row">
                <div class="input-wrap" style="flex:1.5;">
                    <input id="e-email-p" type="email" value="${isPickup ? val(data.customer_email) : ''}" placeholder="Email" style="margin-bottom:0; width:100%; color:#4da6ff; text-decoration:underline; cursor:pointer;" readonly onmousedown="startPress(this)" ontouchstart="startPress(this)" onmouseup="cancelPress()" onmouseleave="cancelPress()" ontouchend="cancelPress()" onclick="handleLinkClick(this, 'email')">
                    <button class="copy-btn" onclick="copyField('e-email-p')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
                <div class="input-wrap" style="flex:1;">
                    <input id="e-phone-p" type="tel" value="${isPickup ? val(data.customer_phone) : ''}" placeholder="Phone Number" oninput="formatPhone(this)" style="margin-bottom:0; width:100%; color:#4da6ff; text-decoration:underline; cursor:pointer;" readonly onmousedown="startPress(this)" ontouchstart="startPress(this)" onmouseup="cancelPress()" onmouseleave="cancelPress()" ontouchend="cancelPress()" onclick="handleLinkClick(this, 'phone')">
                    <button class="copy-btn" onclick="copyField('e-phone-p')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
            </div>

            <div class="input-wrap" style="margin-bottom:12px;">
                <input id="e-pkg" value="${val(data.package_details)}" placeholder="Packages/Items/Dimensions" style="margin-bottom:0; width:100%;">
                <button class="copy-btn" onclick="copyField('e-pkg')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>
            
            <div class="input-wrap" style="margin-bottom:12px;">
                <input id="e-po" value="${val(data.po_number)}" placeholder="PO / Ref" style="margin-bottom:0; width:100%;">
                <button class="copy-btn" onclick="copyField('e-po')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>

            <div class="input-wrap" style="margin-bottom:12px;">
                <textarea id="e-note" placeholder="Driver Notes" oninput="this.style.height='';this.style.height=this.scrollHeight+'px'" style="width:100%; margin-bottom:0; padding:12px; resize:none; overflow:hidden; min-height:60px;">${val(data.other_info)}</textarea>
                <button class="copy-btn" onclick="copyField('e-note')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>

            <div class="input-wrap" style="margin-bottom:12px;">
                <input id="e-add-note" placeholder="Add New Note (Appends to above)" style="margin-bottom:0; width:100%;">
                <button class="copy-btn" onclick="copyField('e-add-note')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>

            <div class="input-wrap" style="margin-bottom:12px;">
                <input id="e-drop-name" value="${val(data.delivery_name)}" placeholder="Delivery Contact/Business Name" style="margin-bottom:0; width:100%;">
                <button class="copy-btn" onclick="copyField('e-drop-name')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
            </div>

            <div class="flex-row">
                <div class="input-wrap" style="flex:2;">
                    <input id="e-drop" value="${val(data.destination)}" placeholder="Delivery Address" style="margin-bottom:0; width:100%;">
                    <button class="copy-btn" onclick="copyField('e-drop')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
                <div class="input-wrap" style="flex:1;">
                    <input id="e-city-d" value="${val(data.city)}" placeholder="City" style="margin-bottom:0; width:100%;">
                    <button class="copy-btn" onclick="copyField('e-city-d')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
            </div>
            <div class="flex-row">
                <div class="input-wrap" style="flex:1.5;">
                    <input id="e-email-d" type="email" value="${!isPickup ? val(data.customer_email) : ''}" placeholder="Email" style="margin-bottom:0; width:100%; color:#4da6ff; text-decoration:underline; cursor:pointer;" readonly onmousedown="startPress(this)" ontouchstart="startPress(this)" onmouseup="cancelPress()" onmouseleave="cancelPress()" ontouchend="cancelPress()" onclick="handleLinkClick(this, 'email')">
                    <button class="copy-btn" onclick="copyField('e-email-d')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
                <div class="input-wrap" style="flex:1;">
                    <input id="e-phone-d" type="tel" value="${!isPickup ? val(data.customer_phone) : ''}" placeholder="Phone Number" oninput="formatPhone(this)" style="margin-bottom:0; width:100%; color:#4da6ff; text-decoration:underline; cursor:pointer;" readonly onmousedown="startPress(this)" ontouchstart="startPress(this)" onmouseup="cancelPress()" onmouseleave="cancelPress()" ontouchend="cancelPress()" onclick="handleLinkClick(this, 'phone')">
                    <button class="copy-btn" onclick="copyField('e-phone-d')"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>
                </div>
            </div>

            <select id="e-driver" class="driver-select" style="margin-bottom:12px;">${driverOpts}</select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 2fr; gap:12px; margin-top:15px;">
            <button onclick="document.getElementById('detailsModal').style.display='none';document.body.style.overflow=''" style="background:#222; color:#ccc; border:1px solid #333; padding:16px; font-weight:700; cursor:pointer; font-size:14px; border-radius:6px;">CANCEL</button>
            <button onclick="saveEdit('${id}', '${type}')" style="background:var(--active-green); color:#000; border:none; padding:16px; font-weight:800; text-transform:uppercase; cursor:pointer; font-size:14px; border-radius:6px;">SAVE</button>
        </div>
    `;
    
    const modalContent = document.querySelector('#detailsModal .modal-content');
    modalContent.innerHTML = html;
    
    const ta = document.getElementById('e-note');
    if(ta) ta.style.height = ta.scrollHeight + 'px';

    document.getElementById('detailsModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function archiveAsFailed(id, type) {
    if(confirm("Archive this job as Failed (Unassigned)?")) {
            const node = type === 'pickup' ? 'pickups' : 'dropoffs';
            const existingNote = (type === 'pickup' ? rawPickups[id] : rawDropoffs[id])?.other_info || "";
            db.ref(node).child(id).update({
                status: 'completed',
                assigned_to: 'Unassigned',
                completed_at: firebase.database.ServerValue.TIMESTAMP,
                other_info: "[ARCHIVED DND/DNP] " + existingNote,
                last_edit_by: currentUser
            });
            document.getElementById('detailsModal').style.display = 'none';
            document.body.style.overflow = '';
    }
}

function saveEdit(id, type) {
    let noteVal = document.getElementById('e-note').value;
    const addVal = document.getElementById('e-add-note').value;
    if(addVal.trim()) noteVal = (noteVal ? noteVal + " " : "") + `[${currentUser}]: ${addVal.trim()}`;

    const newDriver = document.getElementById('e-driver').value;
    const oldData = type === 'pickup' ? rawPickups[id] : rawDropoffs[id];
    const oldInfo = (oldData.other_info || "").toLowerCase();
    
    if ((oldInfo.includes("dnd") || oldInfo.includes("dnp")) && newDriver !== 'Unassigned') {
        noteVal = noteVal.replace(/dnd/gi, "").replace(/dnp/gi, ""); 
        noteVal += ` [reassigned by ${currentUser}]`;
    }

    const updates = {
        assigned_to: document.getElementById('e-driver').value,
        package_details: document.getElementById('e-pkg').value,
        po_number: document.getElementById('e-po').value,
        name: document.getElementById('e-name').value,
        pickup_location: document.getElementById('e-pickup').value,
        city: type === 'pickup' ? document.getElementById('e-city-p').value : document.getElementById('e-city-d').value,
        delivery_name: document.getElementById('e-drop-name').value,
        destination: document.getElementById('e-drop').value,
        other_info: noteVal,
        customer_email: type === 'pickup' ? document.getElementById('e-email-p').value : document.getElementById('e-email-d').value,
        customer_phone: type === 'pickup' ? document.getElementById('e-phone-p').value : document.getElementById('e-phone-d').value,
        last_edit_by: currentUser
    };
    const node = type === 'pickup' ? 'pickups' : 'dropoffs';
    db.ref(node).child(id).update(updates).then(() => {
        document.getElementById('detailsModal').style.display = 'none';
        document.body.style.overflow = '';
    });
}

function deleteJob(id, type) {
    if(confirm("Delete this dispatch completely?")) {
        const node = type === 'pickup' ? 'pickups' : 'dropoffs';
        db.ref(node).child(id).remove();
        document.getElementById('detailsModal').style.display = 'none';
        document.body.style.overflow = '';
    }
}

function renderData() {
    const pList = document.getElementById("list-pickups"); 
    const dList = document.getElementById("list-deliveries");
    const statsPanel = document.getElementById("driver-stats-panel");
    const searchTerm = document.getElementById("archive-search") ? document.getElementById("archive-search").value.toLowerCase() : "";
    
    pList.innerHTML = ""; dList.innerHTML = ""; statsPanel.innerHTML = "";
    document.getElementById("list-archive").innerHTML = "";

    // DND LIST CLEAR
    const dndList = document.getElementById("list-dnd");
    dndList.innerHTML = "";

    const filterUI = document.getElementById('filter-reset-ui');
    if(filterUI) filterUI.style.display = currentDriverFilter ? 'block' : 'none';

    // NEW FILTER VALUES
    const afDriver = document.getElementById('af-driver') ? document.getElementById('af-driver').value : "";
    const afName = document.getElementById('af-name') ? document.getElementById('af-name').value.toLowerCase() : "";
    const afCity = document.getElementById('af-city') ? document.getElementById('af-city').value.toLowerCase() : "";
    const afManual = document.getElementById('af-manual-search') ? document.getElementById('af-manual-search').value.toLowerCase() : "";

    let stopLookup = {};
    if(currentDriverFilter && driverLocationsData[currentDriverFilter]) {
        const dData = driverLocationsData[currentDriverFilter];
        if(dData.route_order && Array.isArray(dData.route_order)) {
            dData.route_order.forEach((jid, idx) => { stopLookup[jid] = idx + 1; });
        } else if (dData.route_string) {
            const parts = dData.route_string.split(' | ');
            parts.forEach(p => {
                const idx = p.indexOf('. ');
                if(idx > -1) {
                    const num = parseInt(p.substring(0, idx));
                    const txt = p.substring(idx+2).trim();
                    stopLookup[txt] = num;
                }
            });
        }
    }

    if(currentDriverFilter) {
        const drvData = driverLocationsData[currentDriverFilter];
        const label = document.getElementById("selected-driver-label");
        if(label) {
            label.style.display = "block";
            const dColors = {
                'Matt': '#FF8C00', 'Touch': '#00BFFF', 'Julian': '#3F51B5',
                'Jess': '#FF69B4', 'Alysha': '#9C27B0', 'Kayla': '#E91E63'
            };
            const c = dColors[currentDriverFilter] || '#ffffff';
            label.style.borderColor = c;
            label.style.color = c;
            label.style.boxShadow = `0 0 15px ${c}`;
            
            const timeInfo = (drvData && drvData.total_duration) ? `<br><span style="font-size:14px; color:#fff;">ETA: ${drvData.total_duration}</span>` : "";
            label.innerHTML = currentDriverFilter + timeInfo;
        }

        const mapHead = document.getElementById("map-driver-head");
        if(mapHead) {
            const dColors = {
                'Matt': '#FF8C00', 'Touch': '#00BFFF', 'Julian': '#3F51B5',
                'Jess': '#FF69B4', 'Alysha': '#9C27B0', 'Kayla': '#E91E63'
            };
            mapHead.style.display = "block";
            mapHead.innerText = currentDriverFilter;
            mapHead.style.color = dColors[currentDriverFilter] || '#fff';
        }

        if(document.getElementById('map-modal').style.display === 'block' && mainMap && drvData) {
                const badge = document.getElementById("route-time-badge");
                if (badge && drvData.total_duration) {
                badge.innerText = "ROUTE TIME: " + drvData.total_duration;
                badge.style.display = "block";
                } else if (badge) {
                badge.style.display = "none";
                }

                const rList = document.getElementById('route-list');
                if(rList) rList.style.display = 'none';

                const pos = { lat: drvData.lat, lng: drvData.lng };
                const timeStr = formatTime12(drvData.gps_timestamp || Date.now());

                if(mapMarkers[currentDriverFilter]) {
                    mapMarkers[currentDriverFilter].setPosition(pos);
                    mapMarkers[currentDriverFilter].setIcon({ 
                            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, 
                            fillColor: '#00b32d', 
                            fillOpacity: 1, 
                            strokeWeight: 1, 
                            strokeColor: '#000000', 
                            scale: 8,
                            anchor: new google.maps.Point(0, 2.5)
                    });
                    mapMarkers[currentDriverFilter].setLabel(null);
                } else {
                    const marker = new google.maps.Marker({
                        position: pos, map: mainMap,
                        icon: { 
                            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, 
                            fillColor: '#00b32d', 
                            fillOpacity: 1, 
                            strokeWeight: 1, 
                            strokeColor: '#000000', 
                            scale: 8,
                            anchor: new google.maps.Point(0, 2.5)
                        },
                        label: null
                    });
                    mapMarkers[currentDriverFilter] = marker;
                }

                if(drvData.active_route) {
                    if(activePolyline) activePolyline.setMap(null);
                    const path = google.maps.geometry.encoding.decodePath(drvData.active_route);
                    activePolyline = new google.maps.Polyline({
                        path: path, geodesic: true,
                        strokeColor: "#2196f3", strokeOpacity: 1.0, strokeWeight: 5,
                        map: mainMap
                    });

                    Object.keys(mapMarkers).forEach(k => {
                        if(k !== currentDriverFilter && !k.startsWith('job_')) {
                            mapMarkers[k].setMap(null);
                            delete mapMarkers[k];
                        }
                    });

                    const bounds = new google.maps.LatLngBounds();
                    path.forEach(p => bounds.extend(p));
                    
                    const driverJobs = [];
                    Object.entries(rawPickups).forEach(([id, j]) => { if(j.assigned_to === currentDriverFilter && j.status === 'pending') driverJobs.push({...j, type:'pickup', id: id}); });
                    Object.entries(rawDropoffs).forEach(([id, j]) => { if(j.assigned_to === currentDriverFilter && j.status === 'pending') driverJobs.push({...j, type:'drop', id: id}); });
                    
                    const geocoder = new google.maps.Geocoder();
                    
                    driverJobs.forEach((job, index) => {
                        const addr = job.type === 'pickup' ? job.pickup_location : job.destination;
                        const labelText = job.type === 'pickup' ? job.name : job.delivery_name;
                        const fullAddr = `${addr}, ${job.city || ''}`;
                        
                        const matchKey = job.type === 'pickup' ? `${job.name} ${job.pickup_location}` : `${job.delivery_name} ${job.destination}`;
                        const sNum = stopLookup[job.id] || stopLookup[matchKey];
                        const finalLabel = sNum ? `${sNum}. ${labelText}` : labelText;

                        // Clean up old job markers if re-rendering
                        const key = `job_${index}`;
                        if(mapMarkers[key]) mapMarkers[key].setMap(null);

                        const placeMarker = (loc) => {
                        const isEven = index % 2 === 0;
                        const marker = new google.maps.Marker({
                            map: mainMap,
                            position: loc,
                            label: { 
                                text: finalLabel, 
                                color: "#00b32d", 
                                fontWeight: "bold",
                                fontSize: "12px",
                                className: "driver-map-label"
                            },
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 5,
                                fillColor: '#ff0000',
                                fillOpacity: 1,
                                strokeWeight: 1,
                                strokeColor: 'white',
                                labelOrigin: new google.maps.Point(0, isEven ? -15 : 15)
                            }
                        });
                        mapMarkers[key] = marker;
                        };

                        if(job.lat && job.lng) {
                        placeMarker({lat: parseFloat(job.lat), lng: parseFloat(job.lng)});
                        } else {
                        geocoder.geocode({ 'address': fullAddr }, (results, status) => {
                            if (status === 'OK') {
                                placeMarker(results[0].geometry.location);
                            }
                        });
                        }
                    });
                    if (!mapBoundsInitialized) {
                    mainMap.fitBounds(bounds);
                    mapBoundsInitialized = true;
                    }
                } else {
                    if(!activePolyline) {
                    mainMap.setCenter(pos);
                    }
                }
        }
    }
    
    let pending = 0, assignedCount = 0, noteCount = 0;
    let driverStats = {};
    let dndCount = 0;

    // Define Colors Here
    const dColors = {
        'Matt': '#FF8C00', 'Touch': '#00BFFF', 'Julian': '#3F51B5',
        'Jess': '#FF69B4', 'Alysha': '#9C27B0', 'Kayla': '#E91E63'
    };

    // INIT DRIVERS from Select
    const driverOptions = document.getElementById('f-driver').options;
    for(let i=0; i<driverOptions.length; i++){
        const dVal = driverOptions[i].value;
        if(dVal !== 'Unassigned' && dVal !== 'Assign Driver') {
            driverStats[dVal] = { p: 0, d: 0 };
        }
    }

    function processJobs(obj, type) {
        const list = type === 'pickup' ? pList : dList;
        
        // Convert to array for sorting
        let entries = Object.entries(obj);
        
        if(currentDriverFilter) {
            entries.sort((a, b) => {
                const numA = stopLookup[a[0]] || stopLookup[type === 'pickup' ? `${a[1].name} ${a[1].pickup_location}` : `${a[1].delivery_name} ${a[1].destination}`] || 999;
                const numB = stopLookup[b[0]] || stopLookup[type === 'pickup' ? `${b[1].name} ${b[1].pickup_location}` : `${b[1].delivery_name} ${b[1].destination}`] || 999;
                return numA - numB;
            });
        } else {
            entries.reverse();
        }
        
        entries.forEach(([id, p]) => {
            // Filter logic
            const textSearch = (p.name + p.pickup_location + p.delivery_name + p.destination + (p.assigned_to||"") + (p.other_info||"") + (p.customer_email||"")).toLowerCase();
            if(searchTerm && !textSearch.includes(searchTerm) && p.status !== 'completed') return;

            // DND/DNP LOGIC for DND LIST
            const infoLower = (p.other_info || "").toLowerCase();
            const isFailed = infoLower.includes("dnd") || infoLower.includes("dnp");
            
            // MAIN LIST FILTER
            if(currentDriverFilter && p.assigned_to !== currentDriverFilter) return;

            // Status check
            if(p.status === 'completed') {
                // Render to Archive
                const d = new Date(p.completed_at || p.timestamp);
                const now = new Date();
                const isToday = d.toDateString() === now.toDateString();

                // strict "from that day only"
                if (!isToday) return;

                // Extended Search for Archive (all info)
                const fullContent = (p.name + p.pickup_location + p.delivery_name + p.destination + (p.assigned_to||"") + (p.other_info||"") + (p.package_details||"") + (p.po_number||"")).toLowerCase();
                if (searchTerm && !fullContent.includes(searchTerm)) return;

                // New Filters
                if (afDriver && p.assigned_to !== afDriver) return;
                if (afName && !(p.name.toLowerCase().includes(afName) || p.delivery_name.toLowerCase().includes(afName))) return;
                if (afCity && !(p.city || "").toLowerCase().includes(afCity)) return;
                if (afManual && !fullContent.includes(afManual)) return;

                const card = document.createElement("div");
                card.className = "history-item"; // Added class for CSS
                card.onclick = () => viewDetails(id, type);
                card.style.cursor = "pointer";
                card.style.borderLeft = "4px solid #333";
                card.style.background = "var(--card)";
                card.style.opacity = "0.7";
                
                const contact = type === 'pickup' ? p.name : p.delivery_name;
                // Format Date
                const dateStr = (d.getMonth() + 1) + "/" + d.getDate();
                const timeStr = formatTime12(p.completed_at || p.timestamp);
                const doneTime = `${dateStr} ${timeStr}`;

                card.innerHTML = `
                    <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;">
                            <span style="font-weight:800; color:#555; text-decoration:line-through; font-size:11px;">${p.assigned_to || 'Unassigned'}</span>
                            <span style="font-size:16px; color:#00b32d; font-weight:900; text-align:center;">DONE</span>
                            <span style="font-size:10px; color:#888; text-align:right; font-weight:700;">${doneTime}</span>
                    </div>
                    <div style="color:#777; font-size:13px; font-weight:700; margin-top:4px;">${contact || 'No Contact'}</div>
                    <div style="color:#555; font-size:11px;">${p.city || ''}</div>
                `;
                document.getElementById("list-archive").appendChild(card);
                return; // Skip adding to main list
            }

            const assignedTo = p.assigned_to;
            const isUnassigned = !assignedTo || assignedTo === 'Unassigned';
            const isUnassignedFailed = isFailed && isUnassigned;
            
            // Active DND Logic: Must be Failed AND Assigned
            if (isFailed) {
                dndCount++;
                const dndCard = document.createElement("div");
                dndCard.className = "history-item dnd-card";
                dndCard.style.background = "#2b0000";
                dndCard.style.border = "2px solid #ff4444";
                dndCard.style.cursor = "pointer";
                dndCard.onclick = () => viewDetails(id, type);
                
                // Card Content Generation (Shared logic simplified)
                const bg = dColors[assignedTo] || '#00b32d'; 
                const darkText = ['#00b32d', '#FF8C00', '#00BFFF', '#FF69B4'].includes(bg);
                const driverHTML = (assignedTo && assignedTo !== 'Unassigned') ? 
                    `<span class="hist-driver" style="background:${bg}; color:${darkText?'#000':'#fff'}">${assignedTo}</span>` : 
                    `<span style="color:#ff4444; font-weight:800; font-size:11px;">UNASSIGNED / FAILED</span>`;
                const contact = type === 'pickup' ? p.name : p.delivery_name;
                const matchKey = type === 'pickup' ? `${p.name} ${p.pickup_location}` : `${p.delivery_name} ${p.destination}`;
                const sNum = stopLookup[id] || stopLookup[matchKey];
                const badgeHTML = sNum ? `<div style="flex-shrink:0; width:24px; height:24px; background:${type==='pickup'?'#ffcc00':'#00b32d'}; color:#000; font-weight:800; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:10px; font-size:12px;">${sNum}</div>` : '';

                dndCard.innerHTML = `
                    <div style="display:flex; flex-direction:column; width:100%;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                            ${badgeHTML || '<div></div>'}
                            ${driverHTML}
                        </div>
                        <div class="hist-name" style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${contact || 'No Contact'}</div>
                        <div style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.city || 'No City'}</div>
                        ${p.package_details ? `<div style="font-size:11px; color:#aaa; margin-top:2px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📦 ${p.package_details}</div>` : ''}
                    </div>
                `;
                dndList.appendChild(dndCard);
                
                if(driverStats[assignedTo]) {
                    if(type === 'pickup') driverStats[assignedTo].p++;
                    else driverStats[assignedTo].d++;
                }
                if(p.driver_edited_note) noteCount++;
                return; // Don't add to main list
            }

            if(isUnassigned) pending++;
            else {
                assignedCount++;
                if(driverStats[assignedTo]) {
                    if(type === 'pickup') driverStats[assignedTo].p++;
                    else driverStats[assignedTo].d++;
                }
            }
            if(p.driver_edited_note) noteCount++;

            const card = document.createElement("div");
            card.className = "history-item"; // Added class for CSS
            
            if(isUnassignedFailed) {
                card.style.background = "#2b0000";
                card.style.border = "2px solid #ff4444";
            } else if(type === 'pickup' && isUnassigned) {
                card.classList.add('urgent-pickup');
            }

            card.onclick = () => viewDetails(id, type);
            card.style.cursor = "pointer";
            // Color coding borders based on type
            card.style.borderLeft = type === 'pickup' ? '4px solid var(--accent)' : '4px solid var(--active-green)';
            
            // Color Map Logic
            const bg = dColors[p.assigned_to] || '#00b32d'; 
            // Light colors need black text, dark colors need white text
            const darkText = ['#00b32d', '#FF8C00', '#00BFFF', '#FF69B4'].includes(bg);
            
            const driverHTML = p.assigned_to ? 
                `<span class="hist-driver" style="background:${bg}; color:${darkText?'#000':'#fff'}">${p.assigned_to}</span>` : 
                `<span style="color:${isUnassignedFailed ? '#ff4444' : '#cc5200'}; font-weight:800; font-size:11px;">${isUnassignedFailed ? 'FAILED ATTEMPT' : 'UNASSIGNED'}</span>`;
            
            const contact = type === 'pickup' ? p.name : p.delivery_name;
            
            // Badge Logic
            const matchKey = type === 'pickup' ? `${p.name} ${p.pickup_location}` : `${p.delivery_name} ${p.destination}`;
            const sNum = stopLookup[id] || stopLookup[matchKey];
            const badgeHTML = sNum ? `<div style="flex-shrink:0; width:24px; height:24px; background:${type==='pickup'?'#ffcc00':'#00b32d'}; color:#000; font-weight:800; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-right:10px; font-size:12px;">${sNum}</div>` : '';

            card.innerHTML = `
                <div style="display:flex; flex-direction:column; width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        ${badgeHTML || '<div></div>'}
                        ${driverHTML}
                    </div>
                    <div class="hist-name" style="font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${contact || 'No Contact'}</div>
                    <div style="font-size:11px; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${p.city || 'No City'}</div>
                    ${p.package_details ? `<div style="font-size:11px; color:#aaa; margin-top:2px; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📦 ${p.package_details}</div>` : ''}
                </div>
            `;
            list.appendChild(card);
        });
    }

    processJobs(rawPickups, 'pickup');
    processJobs(rawDropoffs, 'delivery');
    
    const alertDiv = document.getElementById('header-alert');
    const unassignedDiv = document.getElementById('header-unassigned');
    
    if(dndCount > 0) {
        alertDiv.style.display = 'block';
        alertDiv.innerText = dndCount + " DND/DNP";
        document.getElementById('archive-all-dnd-btn').style.display = 'block';
    } else {
        alertDiv.style.display = 'none';
        document.getElementById('archive-all-dnd-btn').style.display = 'none';
        
        // Auto minimize logic if open
        const dListContainer = document.getElementById('dnd-list-container');
        const dBtn = document.getElementById('toggle-dnd-btn');
        if (dListContainer.style.display === 'flex') {
            dListContainer.style.display = 'none';
            dBtn.classList.remove('btn-pressed');
            dBtn.style.display = 'block';
        }
    }

    if(pending > 0) {
        unassignedDiv.style.display = 'block';
        unassignedDiv.innerText = pending + " UNASSIGNED";
    } else {
        unassignedDiv.style.display = 'none';
    }

    const dndBtn = document.getElementById('toggle-dnd-btn');
    if (dndCount > 0) {
        dndBtn.classList.add('btn-alert-red');
    } else {
        dndBtn.classList.remove('btn-alert-red');
    }

    const activeBtn = document.getElementById('toggle-active-btn');
    if (pending > 0) {
        activeBtn.classList.add('btn-alert-orange');
    } else {
        activeBtn.classList.remove('btn-alert-orange');
    }

    // RENDER DRIVER STATS
    Object.keys(driverStats).forEach(driver => {
        const pCount = driverStats[driver].p;
        const dCount = driverStats[driver].d;
        if(pCount > 0 || dCount > 0) {
            const total = pCount + dCount;
            const pFlex = total > 0 ? (pCount / total) : 0;
            const dFlex = total > 0 ? (dCount / total) : 0;
            
            const color = dColors[driver] || '#fff';
            const duration = (driverLocationsData[driver] && driverLocationsData[driver].total_duration) ? driverLocationsData[driver].total_duration : "";

            const row = document.createElement("div");
            row.className = "driver-stat-row";
            row.style.cursor = "pointer";
            row.onclick = () => filterByDriver(driver);
            row.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <div class="ds-name" style="color:${color};">${driver}</div>
                    ${duration ? `<span class="route-time-display">${duration}</span>` : ''}
                </div>
                <div class="stat-info">
                    ${pCount > 0 ? `<div class="stat-item">Pickups <span class="stat-val-p">${pCount}</span></div>` : ''}
                    ${dCount > 0 ? `<div class="stat-item">Deliveries <span class="stat-val-d">${dCount}</span></div>` : ''}
                </div>
            `;
            statsPanel.appendChild(row);
        }
    });

    document.getElementById("stat-pending").innerText = pending;
    document.getElementById("stat-assigned").innerText = assignedCount;
    document.getElementById("stat-note").innerText = noteCount;
    document.getElementById("note-box").style.display = noteCount > 0 ? "block" : "none";
    document.getElementById("pending-box").className = "stat-box" + (pending > 0 ? " unassigned-glow" : "");
}

/* --- PWA INSTALL LOGIC --- */
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'block';
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
        installBtn.style.display = 'none';
    }
    deferredPrompt = null;
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
    // Change './sw.js' to './firebase-messaging-sw.js'
    navigator.serviceWorker.register('./firebase-messaging-sw.js')
        .then(reg => {
        console.log('SW Registered');
        swReg = reg; // This fills the global variable we made
        messaging.useServiceWorker(reg);
        })
        .catch(err => console.log('SW Error', err));
    });
}
