// --- Variables globales y configuración ---

// Variables para manejar el retraso del ocultamiento
let tooltipHideTimeout;
const TOOLTIP_HIDE_DELAY = 300; // milisegundos para retrasar el ocultamiento

// --- Funciones de utilidad ---

/**
 * Solicita la traducción de una palabra al background script.
 * @param {string} word - La palabra en inglés a traducir.
 * @returns {Promise<string>} La traducción en español.
 */
async function translateWord(word) {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ action: "translateWord", word: word }, function(response) {
            if (chrome.runtime.lastError) {
                console.error("My HighVocab - Error al enviar mensaje al background:", chrome.runtime.lastError.message);
                resolve(`Error interno: ${chrome.runtime.lastError.message}`);
                return;
            }
            if (response.error) {
                resolve(response.error);
            } else if (response.translation) {
                resolve(response.translation);
            } else {
                resolve("Error desconocido en la traducción.");
            }
        });
    });
}

/**
 * Guarda una palabra como "marcada" en el almacenamiento de Chrome.
 * @param {string} word - La palabra en inglés a guardar.
 */
async function saveMarkedWord(word) {
    chrome.storage.sync.get('markedWords', function(data) {
        let markedWords = data.markedWords || [];
        if (!markedWords.includes(word.toLowerCase())) { // Evitar duplicados y guardar en minúsculas
            markedWords.push(word.toLowerCase());
            chrome.storage.sync.set({ 'markedWords': markedWords }, function() {
                if (chrome.runtime.lastError) {
                    console.error("My HighVocab - Error al guardar palabra marcada:", chrome.runtime.lastError.message);
                } else {
                    console.log(`My HighVocab: Palabra '${word}' marcada y guardada.`);
                    // Opcional: Podrías notificar al usuario en el tooltip o de otra forma
                }
            });
        }
    });
}

/**
 * Obtiene las palabras marcadas del almacenamiento.
 * @returns {Promise<string[]>} Un array de palabras marcadas.
 */
async function getMarkedWords() {
    return new Promise(resolve => {
        chrome.storage.sync.get('markedWords', function(data) {
            resolve(data.markedWords || []);
        });
    });
}

// Helper para ocultar el tooltip con un retraso
function startTooltipHideTimer(relatedTarget) {
    clearTimeout(tooltipHideTimeout); // Limpia cualquier temporizador anterior
    tooltipHideTimeout = setTimeout(() => {
        // Asegúrate de que no estamos volviendo a entrar en una palabra resaltada o el propio tooltip
        if (!tooltip.contains(relatedTarget) && 
            (!relatedTarget || !relatedTarget.classList.contains('my-highvocab-highlight'))) {
            
            tooltip.style.opacity = '0';
            currentHoveredWord = '';
            currentHoveredElement = null;
            delete tooltip.dataset.currentWord;
            saveButtonInTooltip.style.display = 'inline-block';
        }
    }, TOOLTIP_HIDE_DELAY);
}

/**
 * Resalta las palabras marcadas en la página.
 * Se llama cuando la página carga y después de guardar una nueva palabra.
 */
async function highlightMarkedWords() {
    const markedWords = await getMarkedWords();
    if (markedWords.length === 0) return;

    // Crear un TreeWalker para recorrer solo nodos de texto
    const treeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            // Filtro para ignorar scripts, estilos y el propio tooltip de la extensión
            acceptNode: function(node) {
                if (node.parentNode.nodeName === 'SCRIPT' ||
                    node.parentNode.nodeName === 'STYLE' ||
                    node.parentNode.id === 'my-highvocab-tooltip' ||
                    node.parentNode.classList.contains('my-highvocab-highlight') // Evitar re-procesar texto ya resaltado
                ) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    let currentNode;
    while ((currentNode = treeWalker.nextNode())) {
        const text = currentNode.nodeValue;
        let replaced = false;

        markedWords.forEach(word => {
            // Usar una expresión regular para encontrar la palabra completa (case-insensitive)
            // y evitar coincidencias parciales dentro de otras palabras.
            const regex = new RegExp(`\\b(${word})\\b`, 'gi'); // \b para límites de palabra, gi para global e insensitive

            if (regex.test(text)) {
                const newText = text.replace(regex, (match) => {
                    // Si ya está dentro de un span de resaltado, no lo envuelvas de nuevo
                    if (currentNode.parentNode.classList.contains('my-highvocab-highlight')) {
                        return match;
                    }
                    return `<span class="my-highvocab-highlight" data-translation="${match}">${match}</span>`;
                });

                if (newText !== text) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = newText;
                    // Reemplazar el nodo de texto original con los nuevos nodos (texto y spans)
                    while (tempDiv.firstChild) {
                        currentNode.parentNode.insertBefore(tempDiv.firstChild, currentNode);
                    }
                    currentNode.parentNode.removeChild(currentNode);
                    replaced = true;
                }
            }
        });
        // Si el nodo de texto fue reemplazado, el TreeWalker puede perder su posición.
        // Es más robusto re-evaluar el TreeWalker o manejar la iteración de forma diferente
        // para asegurar que no se salten nodos. Para esta implementación, es simple.
        // En un caso más complejo, se podría clonar el TreeWalker o reiniciar.
    }

    // Añadir estilos CSS para las palabras resaltadas
    let style = document.getElementById('my-highvocab-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'my-highvocab-style';
        style.textContent = `
            .my-highvocab-highlight {
                background-color: #ffeb3b; /* Amarillo suave */
                cursor: pointer;
                border-bottom: 1px dashed #cddc39; /* Línea para indicar que es interactivo */
                font-weight: bold;
                position: relative; /* Para el tooltip si lo anclamos a esto */
            }
            .my-highvocab-highlight:hover {
                background-color: #ffc107; /* Amarillo más oscuro al pasar el mouse */
            }
        `;
        document.head.appendChild(style);
    }
}


// --- Lógica de inyección del tooltip ---

const tooltip = document.createElement('div');
tooltip.id = 'my-highvocab-tooltip';
tooltip.style.cssText = `
    position: absolute;
    background-color: #333;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.2s ease-in-out;
    max-width: 300px;
    word-wrap: break-word;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    display: flex; /* Para alinear el texto y el botón */
    align-items: center;
    gap: 8px; /* Espacio entre traducción y botón */
`;
document.body.appendChild(tooltip);

// Botón para guardar la palabra en el tooltip
const saveButtonInTooltip = document.createElement('button');
saveButtonInTooltip.textContent = 'Guardar';
saveButtonInTooltip.style.cssText = `
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 3px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 0.8em;
    flex-shrink: 0; /* Evita que el botón se encoja */
`;
saveButtonInTooltip.addEventListener('click', async (e) => {
    e.stopPropagation();
    console.log('saveButtonInTooltip clicked');
    const wordToSave = tooltip.dataset.currentWord;
    if (wordToSave) {
        try {
            await saveMarkedWord(wordToSave); // Ahora saveMarkedWord es una promesa que puede rechazar
            tooltipTextSpan.textContent = `"${wordToSave}" guardada!`; // Usar tooltipTextSpan
            saveButtonInTooltip.style.display = 'none';
            highlightMarkedWords(); // Llamar a resaltar después de guardar
            setTimeout(() => {
                tooltip.style.opacity = '0';
                delete tooltip.dataset.currentWord;
                saveButtonInTooltip.style.display = 'inline-block';
            }, 1500);
        } catch (error) {
            console.error("Error al guardar la palabra:", error);
            tooltipTextSpan.textContent = `Error al guardar: ${error.message}`;
            setTimeout(() => {
                tooltip.style.opacity = '0';
                delete tooltip.dataset.currentWord;
                saveButtonInTooltip.style.display = 'inline-block';
            }, 2500);
        }
    }
});
tooltip.appendChild(saveButtonInTooltip); // Añadir el botón al tooltip

const tooltipTextSpan = document.createElement('span');
tooltipTextSpan.id = 'my-highvocab-tooltip-text';
tooltip.prepend(tooltipTextSpan); // Añadir el span para el texto de la traducción

// --- Nuevos listeners para el tooltip para manejar su propio mouseenter/mouseleave ---
// Esto es crucial para que el tooltip sepa que el mouse está sobre él.
tooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHideTimeout); // Cancela cualquier temporizador de ocultamiento
});

tooltip.addEventListener('mouseleave', (e) => {
    // Si el mouse sale del tooltip, inicia un temporizador para ocultarlo
    // Esto da tiempo al usuario para mover el mouse del tooltip a otra parte sin que se cierre inmediatamente
    startTooltipHideTimer(e.relatedTarget);
});

// --- Manejo de eventos para traducción al pasar el mouse ---

// Variable para almacenar la palabra actualmente bajo el cursor
let currentHoveredWord = '';
let currentHoveredElement = null;
let hoverTimeout; // Para retrasar la aparición del tooltip

document.addEventListener('mouseover', async (event) => {
    // Cuando el mouse entra, siempre limpiar el temporizador de ocultamiento
    clearTimeout(tooltipHideTimeout);

    let wordToTranslate = '';
    let targetElement = null;

    // Priorizamos la detección de la palabra bajo el cursor, no la selección
    // Solo si el elemento no es un script, estilo, o nuestro propio tooltip
    if (event.target.nodeName === 'SCRIPT' || event.target.nodeName === 'STYLE' || event.target.id === 'my-highvocab-tooltip' || event.target.closest('#my-highvocab-tooltip')) {
        return; // Ignorar si el mouse está sobre el script, estilo o el tooltip mismo
    }

    // Si el elemento es una palabra resaltada por nosotros
    if (event.target.classList.contains('my-highvocab-highlight')) {
        wordToTranslate = event.target.textContent.trim();
        targetElement = event.target;
        // Si ya está resaltada, mostramos la traducción directamente sin llamar a la API
        const translation = event.target.dataset.translation || "No traducción guardada.";
        tooltipTextSpan.textContent = translation;
        tooltip.dataset.currentWord = wordToTranslate; // Guarda la palabra para el botón "Guardar"
        saveButtonInTooltip.style.display = 'none'; // No mostrar botón "Guardar" para palabras ya guardadas

        const rect = targetElement.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX}px`;
        tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
        tooltip.style.opacity = '1';
        return; // Salir, ya hemos manejado la palabra resaltada
    }


    // Intenta obtener la palabra si el mouse está sobre un nodo de texto
    // Esto es más complejo y requiere un enfoque diferente para ser preciso.
    // Por ahora, nos centraremos en el texto seleccionado o en elementos simples.
    // Para una detección de palabra bajo el cursor más precisa:
    // Podrías usar document.caretRangeFromPoint(event.clientX, event.clientY)
    // para obtener un rango en el punto del cursor y luego expandirlo para encontrar la palabra completa.
    // Esto es más avanzado y lo podemos ver más adelante si lo necesitas.

    // Por ahora, si no hay selección, intentamos obtener la palabra de un elemento simple
    if (window.getSelection().toString().length === 0) {
        // Intenta obtener el texto si es un solo "elemento" de texto (e.g., un <span> con una palabra)
        // O si el target es un nodo de texto, intenta obtener la palabra más cercana
        if (event.target.textContent && event.target.textContent.trim().split(/\s+/).length === 1) {
            wordToTranslate = event.target.textContent.trim();
            targetElement = event.target;
        } else if (event.target.nodeType === Node.TEXT_NODE) {
            // Intento básico de obtener la palabra si el mouse está sobre un nodo de texto
            const range = document.caretRangeFromPoint(event.clientX, event.clientY);
            if (range) {
                const textNode = range.startContainer;
                const offset = range.startOffset;
                const textContent = textNode.textContent;

                // Expandir hacia atrás para encontrar el inicio de la palabra
                let start = offset;
                while (start > 0 && /\w/.test(textContent[start - 1])) {
                    start--;
                }

                // Expandir hacia adelante para encontrar el final de la palabra
                let end = offset;
                while (end < textContent.length && /\w/.test(textContent[end])) {
                    end++;
                }
                
                wordToTranslate = textContent.substring(start, end).trim();
                targetElement = textNode.parentElement; // Usar el padre para posicionar
            }
        }
    } else {
        // Si hay texto seleccionado, usa eso
        wordToTranslate = window.getSelection().toString().trim();
        if (window.getSelection().rangeCount > 0) {
            const range = window.getSelection().getRangeAt(0);
            targetElement = range.getClientRects().length > 0 ? range.getClientRects()[0] : null;
        }
    }


    // Validar la palabra antes de procesarla
    if (wordToTranslate && wordToTranslate.length > 1 && wordToTranslate.match(/^[a-zA-Z']+$/)) {
        if (wordToTranslate.length > 50) return; // Limitar longitud
        if (currentHoveredWord === wordToTranslate) return; // Ya estamos procesando esta palabra

        currentHoveredWord = wordToTranslate;
        currentHoveredElement = targetElement; // Guardar el elemento para posicionamiento

        // Mostrar "Traduciendo..." inmediatamente
        tooltipTextSpan.textContent = 'Traduciendo...';
        tooltip.dataset.currentWord = wordToTranslate;
        saveButtonInTooltip.style.display = 'inline-block'; // Mostrar el botón "Guardar"
        
        const rect = targetElement ? (targetElement.getBoundingClientRect ? targetElement.getBoundingClientRect() : targetElement) : null;
        if (rect) {
            tooltip.style.left = `${rect.left + window.scrollX}px`;
            tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
        } else {
            tooltip.style.left = `${event.pageX + 10}px`;
            tooltip.style.top = `${event.pageY + 10}px`;
        }
        tooltip.style.opacity = '1';

        // Ahora, la traducción se hará SOLO al hacer clic en el tooltip.
        // No llamamos a translateWord aquí.
    } else {
        // Si no es una palabra válida, y el mouse no está sobre el tooltip, iniciar el temporizador para ocultar
        if (!tooltip.contains(event.relatedTarget)) { // Asegurarse de que no estoy entrando en el tooltip
             startTooltipHideTimer(event.relatedTarget);
        }
    }
});

// Añadir un listener de clic al tooltip para traducir y guardar
tooltip.addEventListener('click', async (event) => {
    // Si el clic fue en el botón "Guardar", ya se maneja en su propio listener
    if (event.target === saveButtonInTooltip) {
        return;
    }

    const wordToTranslate = tooltip.dataset.currentWord;
    if (wordToTranslate && tooltipTextSpan.textContent === 'Traduciendo...') { // Solo traducir si no se ha traducido ya
        tooltipTextSpan.textContent = 'Obteniendo traducción...';
        const translation = await translateWord(wordToTranslate);
        tooltipTextSpan.textContent = translation;
        // La palabra ya está en tooltip.dataset.currentWord
        // El botón "Guardar" ya está visible
        // Después de traducir, no queremos que se cierre inmediatamente,
        // el mouseout del tooltip se encargará de ello si el mouse sale del tooltip
    }
});


document.addEventListener('mouseout', (event) => {
    // Si el mouse sale del documento o un elemento y no entra en el tooltip o una palabra resaltada
    const isExitingToHighlight = event.relatedTarget && event.relatedTarget.classList.contains('my-highvocab-highlight');
    const isExitingToTooltip = tooltip.contains(event.relatedTarget);

    if (!isExitingToTooltip && !isExitingToHighlight) {
        // En lugar de ocultar directamente, inicia el temporizador
        startTooltipHideTimer(event.relatedTarget);
    }
});

window.addEventListener('scroll', () => {
    // Al hacer scroll, ocultar el tooltip inmediatamente
    clearTimeout(tooltipHideTimeout); // Limpiar cualquier temporizador pendiente
    tooltip.style.opacity = '0';
    currentHoveredWord = '';
    currentHoveredElement = null;
    delete tooltip.dataset.currentWord;
    saveButtonInTooltip.style.display = 'inline-block';
});

// Ejecutar el resaltado de palabras al cargar la página
try {
    highlightMarkedWords();
} catch (error) {
    console.error("Error inicial al resaltar palabras:", error);
}

// Observar cambios en el DOM para resaltar nuevas palabras añadidas dinámicamente
const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Podríamos ser más eficientes y solo escanear los nodos añadidos,
            // pero por simplicidad, re-ejecutamos el resaltado completo.
            // Una optimización sería recorrer solo mutation.addedNodes.
            try {
                 highlightMarkedWords(); // También envuelto en try/catch
            } catch (error) {
                console.error("Error al resaltar palabras en mutación:", error);
            }
            break;
        }
    }
});

observer.observe(document.body, { childList: true, subtree: true });