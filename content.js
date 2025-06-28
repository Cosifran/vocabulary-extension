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
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "translateWord", word: word },
      function (response) {
        if (chrome.runtime.lastError) {
          console.error(
            "My HighVocab - Error al enviar mensaje al background:",
            chrome.runtime.lastError.message
          );
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
      }
    );
  });
}

/**
 * Guarda una palabra como "marcada" en el almacenamiento de Chrome.
 * Ahora guarda un objeto { word: string, translation: string }.
 * @param {string} word - La palabra en inglés a guardar.
 * @param {string} translation - La traducción en español de la palabra.
 */
/**
 * Guarda una palabra como "marcada" en el almacenamiento de Chrome.
 * Ahora guarda un objeto { word: string, translation: string }.
 * @param {string} word - La palabra en inglés a guardar.
 * @param {string} translation - La traducción en español de la palabra.
 */
async function saveMarkedWord(word, translation) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("markedWords", function (data) {
      if (chrome.runtime.lastError) {
        console.error(
          "My HighVocab - Error al obtener palabras marcadas para guardar:",
          chrome.runtime.lastError.message
        );
        return reject(
          new Error(
            "Error al acceder al almacenamiento: " +
              chrome.runtime.lastError.message
          )
        );
      }

      let markedWords = data.markedWords || [];

      // --- Lógica de migración de datos (NUEVO) ---
      // Asegurarse de que todos los elementos sean objetos { word, translation }
      markedWords = markedWords
        .map((item) => {
          if (typeof item === "string") {
            // Si es una cadena antigua, conviértela a objeto.
            // Podríamos buscar su traducción si la tuviéramos, pero por ahora,
            // usaremos la palabra misma como "traducción" o una cadena vacía.
            // Idealmente, esto solo se ejecutaría una vez si hay datos viejos.
            console.warn(
              `My HighVocab: Migrando palabra antigua '${item}' a nuevo formato.`
            );
            return { word: item.toLowerCase(), translation: "" }; // O puedes poner item si no tienes la traducción original
          }
          // Si ya es un objeto o nulo/undefined, retornarlo tal cual, pero filtraremos los nulos.
          return item;
        })
        .filter((item) => item && typeof item.word === "string"); // Filtrar nulos/undefined y asegurar que 'word' exista

      const lowerCaseWord = word.toLowerCase();

      // Verificar si la palabra ya está guardada (ignorando mayúsculas/minúsculas)
      // Aquí usamos 'item && item.word' para evitar el error si item fuera undefined/null
      const existingIndex = markedWords.findIndex(
        (item) => item && item.word.toLowerCase() === lowerCaseWord
      );

      if (existingIndex === -1) {
        // Si la palabra no existe, la añadimos
        markedWords.push({ word: lowerCaseWord, translation: translation });
      } else {
        // Si la palabra ya existe, actualizamos su traducción por si acaso
        markedWords[existingIndex].translation = translation;
        console.log(
          `My HighVocab: Palabra '${word}' ya marcada, traducción actualizada.`
        );
      }

      chrome.storage.sync.set({ markedWords: markedWords }, function () {
        if (chrome.runtime.lastError) {
          console.error(
            "My HighVocab - Error al guardar palabra marcada:",
            chrome.runtime.lastError.message
          );
          reject(
            new Error(
              "Error al guardar palabra: " + chrome.runtime.lastError.message
            )
          );
        } else {
          console.log(
            `My HighVocab: Palabra '${word}' marcada y guardada con traducción.`
          );
          resolve();
        }
      });
    });
  });
}

/**
 * Obtiene las palabras marcadas del almacenamiento.
 * También aplica la migración.
 * @returns {Promise<{word: string, translation: string}[]>} Un array de objetos de palabras marcadas.
 */
async function getMarkedWords() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get("markedWords", function (data) {
      if (chrome.runtime.lastError) {
        console.error(
          "My HighVocab - Error al obtener palabras marcadas:",
          chrome.runtime.lastError.message
        );
        return resolve([]);
      }
      let markedWords = data.markedWords || [];

      // --- Lógica de migración de datos al obtener (NUEVO) ---
      // Asegurarse de que todos los elementos sean objetos { word, translation }
      markedWords = markedWords
        .map((item) => {
          if (typeof item === "string") {
            console.warn(
              `My HighVocab: Migrando palabra antigua '${item}' a nuevo formato al obtener.`
            );
            return { word: item.toLowerCase(), translation: "" };
          }
          return item;
        })
        .filter((item) => item && typeof item.word === "string"); // Filtrar nulos/undefined y asegurar que 'word' exista

      // Guardar los datos migrados de vuelta en el almacenamiento para futuras cargas más rápidas
      if (JSON.stringify(markedWords) !== JSON.stringify(data.markedWords)) {
        // Solo guardar si hubo un cambio
        chrome.storage.sync.set({ markedWords: markedWords }, function () {
          if (chrome.runtime.lastError) {
            console.error(
              "My HighVocab: Error al guardar datos migrados:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log(
              "My HighVocab: Datos de palabras marcadas migrados y guardados con éxito."
            );
          }
        });
      }

      resolve(markedWords);
    });
  });
}

// Helper para ocultar el tooltip con un retraso
function startTooltipHideTimer(relatedTarget) {
  clearTimeout(tooltipHideTimeout);
  tooltipHideTimeout = setTimeout(() => {
    // Asegúrate de que no estamos volviendo a entrar en una palabra resaltada o el propio tooltip
    if (
      !tooltip.contains(relatedTarget) &&
      (!relatedTarget ||
        !relatedTarget.classList.contains("my-highvocab-highlight"))
    ) {
      tooltip.style.opacity = "0";
      currentHoveredWord = "";
      currentHoveredElement = null;
      delete tooltip.dataset.currentWord;
      saveButtonInTooltip.style.display = "inline-block";
    }
  }, TOOLTIP_HIDE_DELAY);
}

/**
 * Resalta las palabras marcadas en la página.
 * Ahora usa la traducción guardada para el atributo data-translation.
 */
async function highlightMarkedWords() {
  const markedWords = await getMarkedWords();
  if (markedWords.length === 0) return;

  // Crear un mapa para una búsqueda más rápida: { "palabra": "traducción" }
  const markedWordsMap = new Map(
    markedWords.map((item) => [item.word, item.translation])
  );

  // Crear un TreeWalker para recorrer solo nodos de texto
  const treeWalker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      // Filtro para ignorar scripts, estilos y el propio tooltip de la extensión
      acceptNode: function (node) {
        if (
          node.parentNode.nodeName === "SCRIPT" ||
          node.parentNode.nodeName === "STYLE" ||
          node.parentNode.id === "my-highvocab-tooltip" ||
          node.parentNode.classList.contains("my-highvocab-highlight") // Evitar re-procesar texto ya resaltado
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
    false
  );

  let currentNode;
  while ((currentNode = treeWalker.nextNode())) {
    const text = currentNode.nodeValue;
    let replaced = false;

    markedWordsMap.forEach((translation, word) => {
      // <-- Ahora iteramos sobre el mapa
      // Usar una expresión regular para encontrar la palabra completa (case-insensitive)
      // y evitar coincidencias parciales dentro de otras palabras.
      const regex = new RegExp(`\\b(${word})\\b`, "gi"); // \b para límites de palabra, gi para global e insensitive

      if (regex.test(text)) {
        const newText = text.replace(regex, (match) => {
          // Si ya está dentro de un span de resaltado, no lo envuelvas de nuevo
          if (
            currentNode.parentNode.classList.contains("my-highvocab-highlight")
          ) {
            return match;
          }
          // <-- Usamos la traducción del mapa aquí
          return `<span class="my-highvocab-highlight" data-original-word="${match}" data-translation="${translation}">${match}</span>`;
        });

        if (newText !== text) {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = newText;
          // Reemplazar el nodo de texto original con los nuevos nodos (texto y spans)
          while (tempDiv.firstChild) {
            currentNode.parentNode.insertBefore(
              tempDiv.firstChild,
              currentNode
            );
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
  let style = document.getElementById("my-highvocab-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "my-highvocab-style";
    style.textContent = `
            .my-highvocab-highlight {
                color: #9381ff !important;
    background-color: initial !important;
                cursor: pointer;
                border-bottom: 1px dashed #9381ff; /* Línea para indicar que es interactivo */
                font-weight: bold;
                position: relative; /* Para el tooltip si lo anclamos a esto */
            }
            .my-highvocab-highlight:hover {
                color:rgb(129, 111, 230) ; /* Amarillo más oscuro al pasar el mouse */
            }
        `;
    document.head.appendChild(style);
  }
}

// --- Lógica de inyección del tooltip ---

const tooltip = document.createElement("div");
tooltip.id = "my-highvocab-tooltip";
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
const saveButtonInTooltip = document.createElement("button");
saveButtonInTooltip.textContent = "Guardar";
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
saveButtonInTooltip.addEventListener("click", async (e) => {
  e.stopPropagation();
  console.log("saveButtonInTooltip clicked");
  const wordToSave = tooltip.dataset.currentWord;
  const translationToSave = tooltipTextSpan.textContent; // <-- Obtener la traducción del tooltip

  if (
    wordToSave &&
    translationToSave &&
    translationToSave !== "Traduciendo..." &&
    translationToSave !== "Obteniendo traducción..."
  ) {
    try {
      // <-- Pasar la palabra Y la traducción a saveMarkedWord
      await saveMarkedWord(wordToSave, translationToSave);
      tooltipTextSpan.textContent = `"${wordToSave}" guardada!`; // Usar tooltipTextSpan
      saveButtonInTooltip.style.display = "none";
      highlightMarkedWords(); // Re-resaltar la página para que la palabra guardada se actualice inmediatamente
      setTimeout(() => {
        tooltip.style.opacity = "0";
        delete tooltip.dataset.currentWord;
        saveButtonInTooltip.style.display = "inline-block";
      }, 1500);
    } catch (error) {
      console.error("Error al guardar la palabra:", error);
      tooltipTextSpan.textContent = `Error al guardar: ${error.message}`;
      setTimeout(() => {
        tooltip.style.opacity = "0";
        delete tooltip.dataset.currentWord;
        saveButtonInTooltip.style.display = "inline-block";
      }, 2500);
    }
  } else {
    tooltipTextSpan.textContent = "Por favor, traduce la palabra primero.";
    setTimeout(() => {
      tooltip.style.opacity = "0";
      delete tooltip.dataset.currentWord;
      saveButtonInTooltip.style.display = "inline-block";
    }, 1500);
  }
});
tooltip.appendChild(saveButtonInTooltip); // Añadir el botón al tooltip

const tooltipTextSpan = document.createElement("span");
tooltipTextSpan.id = "my-highvocab-tooltip-text";
tooltip.prepend(tooltipTextSpan); // Añadir el span para el texto de la traducción

// --- Nuevos listeners para el tooltip para manejar su propio mouseenter/mouseleave ---
// Esto es crucial para que el tooltip sepa que el mouse está sobre él.
tooltip.addEventListener("mouseenter", () => {
  clearTimeout(tooltipHideTimeout); // Cancela cualquier temporizador de ocultamiento
});

tooltip.addEventListener("mouseleave", (e) => {
  // Si el mouse sale del tooltip, inicia un temporizador para ocultarlo
  // Esto da tiempo al usuario para mover el mouse del tooltip a otra parte sin que se cierre inmediatamente
  startTooltipHideTimer(e.relatedTarget);
});

// --- Manejo de eventos para traducción al pasar el mouse ---

// Variable para almacenar la palabra actualmente bajo el cursor
let currentHoveredWord = "";
let currentHoveredElement = null;
let hoverTimeout; // Para retrasar la aparición del tooltip

document.addEventListener("mouseover", async (event) => {
  // Al entrar en cualquier elemento, limpiar el temporizador de ocultamiento del tooltip
  clearTimeout(tooltipHideTimeout);

  let wordToTranslate = "";
  let targetElement = null;

  // 1. Ignorar si el mouse está sobre la propia extensión (tooltip o script/style tags)
  if (
    event.target.nodeName === "SCRIPT" ||
    event.target.nodeName === "STYLE" ||
    event.target.id === "my-highvocab-tooltip" ||
    event.target.closest("#my-highvocab-tooltip")
  ) {
    // Si el mouse está sobre el tooltip, no queremos que se oculte por la lógica del document.mouseover
    // Sin embargo, si salió de una palabra y entró al tooltip, el tooltip ya está abierto.
    // Si está sobre el tooltip, simplemente salimos y dejamos que los listeners del tooltip lo manejen.
    return;
  }

  // 2. Prioridad 1: Si hay texto seleccionado
  const selection = window.getSelection();
  if (selection.toString().length > 0) {
    wordToTranslate = selection.toString().trim();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      targetElement =
        range.getClientRects().length > 0 ? range.getClientRects()[0] : null;
    }
  }
  // 3. Prioridad 2: Si el elemento es una palabra resaltada por nosotros (y no hay selección que la sobreescriba)
  else if (event.target.classList.contains("my-highvocab-highlight")) {
    wordToTranslate = event.target.textContent.trim();
    targetElement = event.target;

    // Si es una palabra resaltada, mostramos la traducción guardada directamente
    const storedTranslation =
      event.target.dataset.translation || "No traducción guardada.";
    tooltipTextSpan.textContent = storedTranslation;

    tooltip.dataset.currentWord =
      event.target.dataset.originalWord || wordToTranslate;
    saveButtonInTooltip.style.display = "none"; // Ocultar botón "Guardar" para palabras ya guardadas

    // Posicionar y mostrar tooltip
    const rect = targetElement.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    tooltip.style.opacity = "1";
    return; // Salir, ya hemos manejado la palabra resaltada
  }
  // 4. Prioridad 3: Si el mouse está sobre un elemento con una sola palabra o un nodo de texto
  else {
    // Intenta obtener la palabra si el mouse está sobre un nodo de texto o un elemento simple
    if (
      event.target.textContent &&
      event.target.textContent.trim().split(/\s+/).length === 1
    ) {
      wordToTranslate = event.target.textContent.trim();
      targetElement = event.target;
    } else if (event.target.nodeType === Node.TEXT_NODE) {
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range) {
        const textNode = range.startContainer;
        const offset = range.startOffset;
        const textContent = textNode.textContent;

        let start = offset;
        while (start > 0 && /\w/.test(textContent[start - 1])) {
          start--;
        }

        let end = offset;
        while (end < textContent.length && /\w/.test(textContent[end])) {
          end++;
        }

        wordToTranslate = textContent.substring(start, end).trim();
        targetElement = textNode.parentElement;
      }
    }
  }

  // 5. Validar la palabra y mostrar el tooltip (si no es una palabra resaltada)
  if (
    wordToTranslate &&
    wordToTranslate.length > 1 &&
    wordToTranslate.match(/^[a-zA-Z']+$/)
  ) {
    if (wordToTranslate.length > 50) return;
    // Importante: si la palabra actual ya es la misma que la que se detectó, no hacer nada para evitar parpadeos.
    if (
      currentHoveredWord === wordToTranslate &&
      tooltip.style.opacity === "1" &&
      tooltipTextSpan.textContent !== "Traduciendo..." &&
      tooltipTextSpan.textContent !== "Obteniendo traducción..."
    ) {
      return; // Ya está mostrando la palabra y no está en proceso de traducción
    }

    currentHoveredWord = wordToTranslate;
    currentHoveredElement = targetElement;

    tooltipTextSpan.textContent = "Click para traducir"; // Mostrar estado de carga
    tooltip.dataset.currentWord = wordToTranslate;
    saveButtonInTooltip.style.display = "inline-block"; // Asegurarse de que el botón esté visible

    const rect = targetElement
      ? targetElement.getBoundingClientRect
        ? targetElement.getBoundingClientRect()
        : targetElement
      : null;
    if (rect) {
      tooltip.style.left = `${rect.left + window.scrollX}px`;
      tooltip.style.top = `${rect.bottom + window.scrollY + 5}px`;
    } else {
      // Fallback si no se puede obtener un rectángulo, usar posición del mouse
      tooltip.style.left = `${event.pageX + 10}px`;
      tooltip.style.top = `${event.pageY + 10}px`;
    }
    tooltip.style.opacity = "1";
  } else {
    // Si no es una palabra válida, iniciar el temporizador para ocultar el tooltip
    // Solo si el mouse no está sobre el tooltip.
    if (!tooltip.contains(event.relatedTarget)) {
      startTooltipHideTimer(event.relatedTarget);
    }
  }
});

// Añadir un listener de clic al tooltip para traducir y guardar
tooltip.addEventListener("click", async (event) => {
  // Si el clic fue en el botón "Guardar", ya se maneja en su propio listener
  if (event.target === saveButtonInTooltip) {
    return;
  }

  const wordToTranslate = tooltip.dataset.currentWord;
  if (wordToTranslate && tooltipTextSpan.textContent === "Click para traducir") {
    // Solo traducir si no se ha traducido ya
    tooltipTextSpan.textContent = "Obteniendo traducción...";
    const translation = await translateWord(wordToTranslate);
    tooltipTextSpan.textContent = translation;
    // La palabra ya está en tooltip.dataset.currentWord
    // El botón "Guardar" ya está visible
    // Después de traducir, no queremos que se cierre inmediatamente,
    // el mouseout del tooltip se encargará de ello si el mouse sale del tooltip
  }
});

document.addEventListener("mouseout", (event) => {
  // Si el mouse sale del documento o un elemento y no entra en el tooltip o una palabra resaltada
  const isExitingToHighlight =
    event.relatedTarget &&
    event.relatedTarget.classList.contains("my-highvocab-highlight");
  const isExitingToTooltip = tooltip.contains(event.relatedTarget);

  if (!isExitingToTooltip && !isExitingToHighlight) {
    // En lugar de ocultar directamente, inicia el temporizador
    startTooltipHideTimer(event.relatedTarget);
  }
});

window.addEventListener("scroll", () => {
  // Al hacer scroll, ocultar el tooltip inmediatamente
  clearTimeout(tooltipHideTimeout); // Limpiar cualquier temporizador pendiente
  tooltip.style.opacity = "0";
  currentHoveredWord = "";
  currentHoveredElement = null;
  delete tooltip.dataset.currentWord;
  saveButtonInTooltip.style.display = "inline-block";
});

(async () => {
  // <--- Inicia la IFFI asíncrona
  try {
    // Luego resaltar las palabrass
    await highlightMarkedWords();
  } catch (error) {
    console.error("Error inicial al migrar o resaltar palabras:", error);
  }
})();

// Observar cambios en el DOM para resaltar nuevas palabras añadidas dinámicamente
const observer = new MutationObserver((mutationsList) => {
  for (const mutation of mutationsList) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
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
