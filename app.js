// --- START OF FILE app.js ---

// --- STATE & INITIALIZATION ---
// flightData.waypoints[n].altFeet représente maintenant l'altitude VRAIE
let flightData = { routeName: '', waypoints: [] };
let globalIsaDeviation = 0;
let newPointCounter = 1;

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'FILE_SHARE') {
            processFile(event.data.file);
        }
    });
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const logBody = document.getElementById('log-body');

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    document.getElementById('generate-json-button').addEventListener('click', handleGenerateJSON);
    document.getElementById('generate-fpl-button').addEventListener('click', handleGenerateFPL);
    document.getElementById('generate-kml-button').addEventListener('click', handleGenerateKML);
    document.getElementById('generate-crd-button').addEventListener('click', handleGenerateCRD);
    document.getElementById('print-button').addEventListener('click', handlePrint);
    document.getElementById('global-isa-input').addEventListener('input', handleGlobalIsaChange);
    
    // Gestionnaires d'événements pour la modale FPL
    const fplModal = document.getElementById('fpl-options-modal');
    document.getElementById('fpl-modal-close').addEventListener('click', () => fplModal.style.display = 'none');
    document.getElementById('fpl-standard-btn').addEventListener('click', generateFplStandard);
    document.getElementById('fpl-altitude-btn').addEventListener('click', generateFplWithAltitudesInName);
    fplModal.addEventListener('click', (e) => {
        if (e.target === fplModal) {
            fplModal.style.display = 'none';
        }
    });

    // Gestionnaires d'événements pour le glisser-déposer
    logBody.addEventListener('click', handleLogTableClick);
    logBody.addEventListener('input', handleTableInput);
    logBody.addEventListener('dragstart', handleDragStart);
    logBody.addEventListener('dragover', handleDragOver);
    logBody.addEventListener('dragleave', handleDragLeave);
    logBody.addEventListener('drop', handleDrop);
    logBody.addEventListener('dragend', handleDragEnd);
});


// --- UI & DATA MANIPULATION FUNCTIONS ---

// Fonction utilitaire pour redimensionner un textarea
function autosizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto'; // Réinitialise pour obtenir le bon scrollHeight si le texte diminue
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function populateLogTable() {
    const logTable = document.getElementById('log-table');
    logTable.querySelector('thead tr').innerHTML = `
        <th class="col-num">#</th>
        <th class="col-wp">Waypoint</th>
        <th class="col-coords">Coordonnées</th>
        <th class="col-alt">Altitude</th>
        <th class="col-comment">Commentaires</th>
        <th class="col-actions">Actions</th>
    `;

    const logBody = document.getElementById('log-body');
    logBody.innerHTML = '';
    flightData.waypoints.forEach((wp, index) => {
        const row = logBody.insertRow();
        row.className = 'draggable-row';
        row.setAttribute('draggable', 'true');
        row.setAttribute('data-index', index);
        
        const ddmCoords = decimalToDDM(wp.lat, wp.lon);
        const hasOverride = wp.isaDeviationC !== undefined;
        if (hasOverride) {
            row.classList.add('has-override');
        }

        // Structure HTML inversée pour la cellule altitude
        row.innerHTML = `
            <td class="drag-handle" title="Glisser pour réorganiser"><span>${index + 1}</span><span class="drag-icon">☰</span></td>
            <td class="editable-cell">
                <span class="display-value">${wp.identifier}</span>
                <input type="text" class="input-value" value="${wp.identifier}" style="display:none;">
                <button class="edit-btn edit-waypoint-btn" data-index="${index}">Modifier</button>
            </td>
            <td class="editable-cell">
                <span class="display-value">${ddmCoords}</span>
                <input type="text" class="input-value" value="${ddmCoords}" style="display:none;">
                <button class="edit-btn edit-coord-btn" data-index="${index}">Modifier</button>
            </td>
            <td>
                <div class="altitude-cell-content">
                    <div class="true-altitude-wrapper">
                        <input type="number" id="alt-input-${index}" class="altitude-input" data-index="${index}" value="${wp.altFeet}" step="100">
                        <span class="unit">ft</span>
                        <span class="label">(Vraie)</span>
                    </div>
                    <div class="indicated-altitude-display">
                        <!-- Contenu généré par JS -->
                    </div>
                    <hr class="separator">
                    <div class="calculation-details">
                        <div class="general-isa-display">
                            <!-- Contenu généré par JS -->
                        </div>
                        <div class="specific-isa-wrapper">
                            <span>ISA Spéc. :</span>
                            <input type="number" class="per-point-isa-input" data-index="${index}" value="${hasOverride ? wp.isaDeviationC : ''}" placeholder="Général">
                            <span>°C</span>
                            <button class="reset-isa-btn" data-index="${index}" title="Utiliser l'ISA global">⟳</button>
                        </div>
                        <div class="oat-display">
                            <!-- Contenu généré par JS -->
                        </div>
                    </div>
                </div>
            </td>
            <td><textarea class="comment-textarea" data-index="${index}" rows="1">${wp.comment || ''}</textarea></td>
            <td><button class="delete-btn delete-wp-btn" data-index="${index}">Supprimer</button></td>
        `;

        if (index < flightData.waypoints.length - 1) {
            const nextWp = flightData.waypoints[index + 1];
            const distance = calculateDistanceNM(wp.lat, wp.lon, nextWp.lat, nextWp.lon);
            const insertRow = logBody.insertRow();
            insertRow.className = 'insert-row';
            const cell = insertRow.insertCell();
            cell.colSpan = 6;
            cell.innerHTML = `
                <div class="insert-cell-content">
                    <span>Lg: <strong>${distance.toFixed(2)} NM</strong></span>
                    <div class="add-wp-controls">
                        <span>Ajouter à</span>
                        <input type="number" class="distance-input" min="0.1" step="0.1" placeholder="NM">
                        <span>NM du point suivant</span>
                        <button class="add-wp-btn" data-index="${index}">Créer</button>
                    </div>
                    <button class="add-manual-wp-btn" data-index="${index}">Ajouter manuellement</button>
                </div>
                <div class="manual-add-form" data-index="${index}">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="new-wp-ident-${index}">Identifiant</label>
                            <input type="text" id="new-wp-ident-${index}" placeholder="Ex: MON_POINT">
                        </div>
                        <div class="form-group">
                            <label for="new-wp-coords-${index}">Coordonnées</label>
                            <input type="text" id="new-wp-coords-${index}" placeholder="Format: NXX°XX.XX EYYY°YY.YY">
                            <span class="input-hint">Ex: N45°12.34 E005°43.21</span>
                        </div>
                        <div class="form-group">
                            <label for="new-wp-alt-${index}">Altitude Vraie (ft)</label>
                            <input type="number" id="new-wp-alt-${index}" placeholder="Ex: 5000">
                        </div>
                        <div class="form-group full-width">
                            <label for="new-wp-comment-${index}">Commentaire</label>
                            <textarea id="new-wp-comment-${index}" rows="2" placeholder="Facultatif"></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="cancel-manual-wp-btn btn-sm btn-secondary" data-index="${index}">Annuler</button>
                        <button class="save-manual-wp-btn btn-sm btn-success" data-index="${index}">Enregistrer</button>
                    </div>
                </div>
            `;
        }
    });

    // Utiliser setTimeout pour s'assurer que le DOM est prêt avant le redimensionnement.
    setTimeout(() => {
        document.querySelectorAll('.comment-textarea').forEach(autosizeTextarea);
    }, 0);
    
    updateAllIndicatedAltitudes();
}

function updateAllIndicatedAltitudes() {
    document.querySelectorAll('#log-body tr:not(.insert-row)').forEach((row, index) => {
        if (flightData.waypoints[index]) {
            updateIndicatedAltitudeForRow(row, index);
        }
    });
}

function updateIndicatedAltitudeForRow(row, index) {
    const wp = flightData.waypoints[index];
    const hasOverride = wp.isaDeviationC !== undefined;
    const effectiveIsaDev = hasOverride ? wp.isaDeviationC : globalIsaDeviation;

    // Calculs : on part de l'altitude VRAIE (wp.altFeet) pour trouver l'INDIQUÉE
    const { indicatedAltitude, airTempC } = calculateIndicatedAltitude(wp.altFeet, effectiveIsaDev);

    // Sélection des éléments d'affichage
    const indicatedAltDisplay = row.querySelector('.indicated-altitude-display');
    const generalIsaDisplay = row.querySelector('.general-isa-display');
    const oatDisplay = row.querySelector('.oat-display');
    const resetButton = row.querySelector('.reset-isa-btn');

    // Mise à jour de l'affichage
    if (indicatedAltDisplay) {
        indicatedAltDisplay.innerHTML = `<span class="value">≈ ${indicatedAltitude.toLocaleString('fr-FR')} ft</span> <span class="label">(Indiquée)</span>`;
    }
    if (generalIsaDisplay) {
        generalIsaDisplay.textContent = `ISA Générale : ${globalIsaDeviation >= 0 ? '+' : ''}${globalIsaDeviation}°C`;
    }
    if (oatDisplay) {
        oatDisplay.textContent = `T° à l'altitude : ${airTempC.toFixed(1)}°C`;
    }
    
    // Logique pour le bouton reset et le style de la ligne
    if (resetButton) {
        resetButton.style.visibility = hasOverride ? 'visible' : 'hidden';
    }
    row.classList.toggle('has-override', hasOverride);
}

function checkAndDisplayDuplicateWarnings() {
    const warningBanners = document.querySelectorAll('.warning-banner');
    const identifiers = flightData.waypoints.map(wp => wp.identifier);
    const seen = new Set();
    const duplicates = new Set(identifiers.filter(id => seen.size === seen.add(id).size));
    const hasDuplicates = duplicates.size > 0;
    const message = hasDuplicates ? `<strong>Attention :</strong> Identifiants dupliqués : ${Array.from(duplicates).join(', ')}.` : '';
    const displayStyle = hasDuplicates ? 'block' : 'none';
    warningBanners.forEach(banner => { banner.innerHTML = message; banner.style.display = displayStyle; });
}

function displayStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#dc3545' : (type === 'success' ? '#28a745' : '#666');
}

function createDownloadLink(content, fileName, mimeType) {
    const container = document.getElementById('download-container');
    container.innerHTML = '';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.className = 'download-link';
    a.style.backgroundColor = fileName.includes('.kml') ? '#28a745' : (fileName.includes('.crd') ? '#17a2b8' : (fileName.includes('.json') ? '#ffc107' : '#6c757d'));
    if (fileName.includes('.json')) a.style.color = '#212529';
    a.textContent = `Télécharger ${fileName}`;
    container.appendChild(a);
    container.style.display = 'block';
}

// --- EVENT HANDLERS ---
function handleGlobalIsaChange(event) {
    globalIsaDeviation = parseFloat(event.target.value) || 0;
    updateAllIndicatedAltitudes();
}

let draggedItem = null;
function handleDragStart(e) {
    const target = e.target.closest('.draggable-row');
    if (!target || (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON')) {
        e.preventDefault(); return;
    }
    draggedItem = target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', target.dataset.index);
    setTimeout(() => { draggedItem.classList.add('dragging'); }, 0);
}
function handleDragOver(e) {
    e.preventDefault();
    const targetRow = e.target.closest('.draggable-row');
    if (!targetRow || targetRow === draggedItem) return;
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    const rect = targetRow.getBoundingClientRect();
    const middleY = rect.top + rect.height / 2;
    targetRow.classList.add(e.clientY < middleY ? 'drag-over-top' : 'drag-over-bottom');
}
function handleDragLeave(e) {
    const targetRow = e.target.closest('.draggable-row');
    if (targetRow) targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
}
function handleDrop(e) {
    e.preventDefault();
    const targetRow = e.target.closest('.draggable-row');
    if (!targetRow || !draggedItem) return;
    const draggedIndex = parseInt(draggedItem.dataset.index, 10);
    let targetIndex = parseInt(targetRow.dataset.index, 10);
    const rect = targetRow.getBoundingClientRect();
    if (e.clientY >= (rect.top + rect.height / 2)) targetIndex++;
    if (draggedIndex < targetIndex) targetIndex--;
    const [movedItem] = flightData.waypoints.splice(draggedIndex, 1);
    flightData.waypoints.splice(targetIndex, 0, movedItem);
    populateLogTable();
    displayStatus('Ordre des waypoints mis à jour.', 'success');
}
function handleDragEnd(e) {
    draggedItem?.classList.remove('dragging');
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    draggedItem = null;
}

function handleLogTableClick(event) {
    const target = event.target;
    if (target.closest('.dragging')) return;
    const editButton = target.closest('.edit-btn'), addButton = target.closest('.add-wp-btn'), deleteButton = target.closest('.delete-wp-btn'), showManualFormButton = target.closest('.add-manual-wp-btn'), saveManualButton = target.closest('.save-manual-wp-btn'), cancelManualButton = target.closest('.cancel-manual-wp-btn'), resetIsaButton = target.closest('.reset-isa-btn');
    if (resetIsaButton) {
        const index = parseInt(resetIsaButton.dataset.index, 10);
        flightData.waypoints[index].isaDeviationC = undefined;
        const row = resetIsaButton.closest('tr');
        row.querySelector('.per-point-isa-input').value = '';
        updateIndicatedAltitudeForRow(row, index);
    } else if (editButton) handleEditClick(editButton);
    else if (addButton) handleAddPointAtDistance(addButton);
    else if (deleteButton) handleDeleteWaypoint(deleteButton);
    else if (showManualFormButton) showManualAddForm(showManualFormButton);
    else if (saveManualButton) handleManualAddWaypoint(saveManualButton);
    else if (cancelManualButton) hideManualAddForm(cancelManualButton);
}

function handleTableInput(event) {
    const target = event.target;
    const index = parseInt(target.dataset.index, 10);
    if (!flightData.waypoints[index]) return;
    
    const row = target.closest('tr');

    if (target.classList.contains('comment-textarea')) {
        flightData.waypoints[index].comment = target.value;
        autosizeTextarea(target);
    } else if (target.classList.contains('altitude-input')) {
        // La valeur saisie est l'altitude VRAIE
        flightData.waypoints[index].altFeet = parseFloat(target.value) || 0;
        updateIndicatedAltitudeForRow(row, index);
    } else if (target.classList.contains('per-point-isa-input')) {
        const value = target.value;
        flightData.waypoints[index].isaDeviationC = (value === '' || value === null) ? undefined : parseFloat(value) || 0;
        updateIndicatedAltitudeForRow(row, index);
    }
}

function handleDeleteWaypoint(button) {
    const index = parseInt(button.dataset.index, 10), waypointIdentifier = flightData.waypoints[index].identifier;
    if (flightData.waypoints.length <= 2) { alert("Impossible de supprimer. Un plan de vol doit contenir au moins 2 points."); return; }
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le waypoint "${waypointIdentifier}" ?`)) {
        flightData.waypoints.splice(index, 1);
        populateLogTable();
        checkAndDisplayDuplicateWarnings();
        displayStatus(`Waypoint "${waypointIdentifier}" supprimé.`, 'success');
    }
}

function handleAddPointAtDistance(button) {
    const index = parseInt(button.dataset.index, 10), input = button.parentElement.querySelector('.distance-input'), distanceFromNext = parseFloat(input.value);
    if (isNaN(distanceFromNext) || distanceFromNext <= 0) { alert("Veuillez entrer une distance valide et positive."); input.classList.add('input-error'); return; }
    input.classList.remove('input-error');
    const wp1 = flightData.waypoints[index], wp2 = flightData.waypoints[index + 1], totalDistance = calculateDistanceNM(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
    if (distanceFromNext >= totalDistance) { alert(`La distance (${distanceFromNext.toFixed(2)} NM) doit être inférieure à la distance totale du segment (${totalDistance.toFixed(2)} NM).`); input.classList.add('input-error'); return; }
    const distanceFromStart = totalDistance - distanceFromNext, bearing = calculateBearing(wp1.lat, wp1.lon, wp2.lat, wp2.lon), newPointCoords = calculateDestinationPoint(wp1.lat, wp1.lon, bearing, distanceFromStart);
    // L'interpolation se fait sur l'altitude VRAIE, ce qui est correct.
    const interpolatedAltitude = wp1.altFeet + (wp2.altFeet - wp1.altFeet) * (distanceFromStart / totalDistance);
    const newWaypoint = { identifier: `NEW_POINT_${newPointCounter++}`, type: 'USER WAYPOINT', lat: newPointCoords.lat, lon: newPointCoords.lon, altFeet: Math.round(interpolatedAltitude), comment: '', isaDeviationC: undefined };
    flightData.waypoints.splice(index + 1, 0, newWaypoint);
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
    displayStatus(`Nouveau point ajouté à ${distanceFromStart.toFixed(2)} NM de "${wp1.identifier}".`, 'success');
}

function showManualAddForm(button) {
    const insertRow = button.closest('.insert-row');
    insertRow.querySelector('.insert-cell-content').style.display = 'none';
    insertRow.querySelector('.manual-add-form').style.display = 'block';
}

function hideManualAddForm(button) {
    const insertRow = button.closest('.insert-row');
    const form = insertRow.querySelector('.manual-add-form');
    form.style.display = 'none';
    insertRow.querySelector('.insert-cell-content').style.display = 'flex';
    form.querySelectorAll('input, textarea').forEach(input => { input.value = ''; input.classList.remove('input-error'); });
}

function handleManualAddWaypoint(button) {
    const index = parseInt(button.dataset.index, 10), form = button.closest('.manual-add-form');
    const identInput = form.querySelector(`#new-wp-ident-${index}`), coordsInput = form.querySelector(`#new-wp-coords-${index}`), altInput = form.querySelector(`#new-wp-alt-${index}`), commentInput = form.querySelector(`#new-wp-comment-${index}`);
    let isValid = true;
    [identInput, coordsInput].forEach(el => el.classList.remove('input-error'));
    const identifier = identInput.value.trim();
    if (!identifier) { identInput.classList.add('input-error'); isValid = false; }
    const coords = parseDDM(coordsInput.value);
    if (!coords) { coordsInput.classList.add('input-error'); isValid = false; }
    if (!isValid) { alert("Veuillez corriger les champs en surbrillance. L'identifiant et les coordonnées sont obligatoires."); return; }
    const newWaypoint = { identifier, type: 'USER WAYPOINT', lat: coords.lat, lon: coords.lon, altFeet: parseFloat(altInput.value) || 0, comment: commentInput.value.trim(), isaDeviationC: undefined };
    flightData.waypoints.splice(index + 1, 0, newWaypoint);
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
    displayStatus(`Nouveau waypoint "${identifier}" ajouté avec succès.`, 'success');
}

function handleEditClick(button) {
    const cell = button.closest('.editable-cell'), displaySpan = cell.querySelector('.display-value'), inputField = cell.querySelector('.input-value'), index = button.dataset.index;
    if (button.classList.contains('save')) {
        let success = false;
        if (button.classList.contains('edit-coord-btn')) {
            const newCoords = parseDDM(inputField.value);
            if (newCoords) { flightData.waypoints[index].lat = newCoords.lat; flightData.waypoints[index].lon = newCoords.lon; populateLogTable(); success = true; } else { alert("Format de coordonnées invalide. Utilisez NXX°XX.XX EYYY°YY.YY"); }
        } else if (button.classList.contains('edit-waypoint-btn')) {
            const newIdentifier = inputField.value.trim();
            if (newIdentifier) { flightData.waypoints[index].identifier = newIdentifier; displaySpan.textContent = newIdentifier; checkAndDisplayDuplicateWarnings(); success = true; } else { alert("Le nom du waypoint ne peut pas être vide."); }
        }
        if (success && !button.classList.contains('edit-coord-btn')) {
            inputField.style.display = 'none'; displaySpan.style.display = 'inline'; button.textContent = 'Modifier'; button.classList.remove('save'); inputField.classList.remove('input-error');
        } else if (!success) { inputField.classList.add('input-error'); }
    } else {
        displaySpan.style.display = 'none'; inputField.style.display = 'inline-block'; button.textContent = 'OK'; button.classList.add('save'); inputField.focus();
    }
}

function handleGenerateJSON() {
    const jsonContent = generateJSON(flightData, globalIsaDeviation);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    createDownloadLink(jsonContent, fileName, 'application/json');
    displayStatus("Fichier de sauvegarde JSON généré !", 'success');
}

function handleGenerateCRD() {
    const firstWp = flightData.waypoints[0], lastWp = flightData.waypoints[flightData.waypoints.length - 1];
    if (!/^[A-Z]{4}$/i.test(firstWp.identifier) || !/^[A-Z]{4}$/i.test(lastWp.identifier)) {
        alert(`Erreur CRD : Le premier et le dernier waypoint doivent être des codes OACI de 4 lettres.`); return;
    }
    const crdContent = generateCRD(flightData.routeName, flightData.waypoints);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.crd`;
    createDownloadLink(crdContent, fileName, 'application/xml');
    displayStatus("Fichier CRD généré !", 'success');
}

function handleGenerateKML() {
    // KML utilise une altitude absolue (MSL), ce qui correspond à notre altitude VRAIE. Pas de conversion nécessaire.
    const kmlContent = generateKML(flightData.routeName, flightData.waypoints);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.kml`;
    createDownloadLink(kmlContent, fileName, 'application/vnd.google-earth.kml+xml');
    displayStatus("Fichier KML généré !", 'success');
}

// --- GESTION DES EXPORTS FPL VIA MODALE AVEC NOUVELLE LOGIQUE D'ALTITUDE ---

function handleGenerateFPL() {
    document.getElementById('fpl-options-modal').style.display = 'flex';
}

// Fonction utilitaire pour préparer les waypoints pour l'export FPL
function prepareWaypointsForFplExport() {
    return flightData.waypoints.map(wp => {
        // Le format FPL attend une altitude INDIQUÉE. Nous devons la calculer.
        const hasOverride = wp.isaDeviationC !== undefined;
        const effectiveIsaDev = hasOverride ? wp.isaDeviationC : globalIsaDeviation;
        const { indicatedAltitude } = calculateIndicatedAltitude(wp.altFeet, effectiveIsaDev);

        // On retourne une copie du waypoint avec l'altitude corrigée pour l'export.
        return { ...wp, altFeet: indicatedAltitude };
    });
}

function generateFplStandard() {
    const waypointsForExport = prepareWaypointsForFplExport();
    const fplContent = generateFPL(flightData.routeName, waypointsForExport);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.fpl`;
    createDownloadLink(fplContent, fileName, 'application/xml');
    displayStatus("Fichier FPL (Standard) généré !", 'success');
    document.getElementById('fpl-options-modal').style.display = 'none';
}

function generateFplWithAltitudesInName() {
    // 1. Calculer l'altitude indiquée pour chaque waypoint
    const waypointsForExport = prepareWaypointsForFplExport();

    // 2. Modifier les noms pour inclure l'altitude VRAIE (d'origine) et l'altitude INDIQUÉE (calculée)
    const waypointsWithModifiedNames = waypointsForExport.map((wp, index) => {
        const originalWp = flightData.waypoints[index]; // Contient l'altitude VRAIE
        const originalName = originalWp.identifier;
        const trueAltitude = originalWp.altFeet;
        const indicatedAltitude = wp.altFeet; // Contient l'altitude INDIQUÉE calculée juste avant

        // Format de nom : WPT-XXXXV-YYYYI
        const newIdentifier = `${originalName}-${trueAltitude}V-${indicatedAltitude}I`;

        // Note: Les systèmes avioniques peuvent avoir une limite de caractères pour les identifiants.
        // Ce format est long mais très descriptif.
        
        return { ...wp, identifier: newIdentifier };
    });

    // 3. Générer le FPL avec les données modifiées
    const fplContent = generateFPL(flightData.routeName, waypointsWithModifiedNames);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_altitudes.fpl`;
    createDownloadLink(fplContent, fileName, 'application/xml');
    displayStatus("Fichier FPL (Nom + Altitudes) généré !", 'success');
    document.getElementById('fpl-options-modal').style.display = 'none';
}

function handlePrint() {
    const table = document.getElementById('log-table');
    const printIndicated = document.getElementById('print-indicated-alt').checked;
    const printTrue = document.getElementById('print-true-alt').checked;

    table.classList.toggle('print-hide-indicated', !printIndicated);
    table.classList.toggle('print-hide-true', !printTrue);

    document.getElementById('print-title').textContent = `Log de Navigation : ${flightData.routeName}`;
    document.getElementById('print-date').textContent = `Imprimé le : ${new Date().toLocaleString('fr-FR')}`;
    
    document.querySelectorAll('.comment-textarea').forEach(textarea => {
        textarea.textContent = textarea.value;
    });

    window.print();
}