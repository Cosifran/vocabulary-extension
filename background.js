const DEEPL_API_URL = "https://api-free.deepl.com/v2/translate";

// Función auxiliar para obtener la clave de DeepL
async function getDeeplApiKeyBackground() {
    return new Promise(resolve => {
        chrome.storage.sync.get('deeplApiKey', function(data) {
            resolve(data.deeplApiKey || null);
        });
    });
}

// Escuchar mensajes del content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Es importante retornar true aquí para indicar que sendResponse será llamado asíncronamente.
    // La función del listener debe ser asíncrona si usa await directamente en su cuerpo.

    // Si el mensaje es para traducir una palabra
    if (request.action === "translateWord") {
        (async () => { // Usamos una IIFE (Immediately Invoked Function Expression) asíncrona
            const word = request.word;
            let deeplApiKey = await getDeeplApiKeyBackground(); // Espera a que la clave se cargue

            if (!deeplApiKey) {
                console.warn("My HighVocab: DeepL API Key no configurada en background.js.");
                sendResponse({ error: "Clave DeepL API no configurada." });
                return; // Importante: Salir de la IIFE
            }

            const formData = new URLSearchParams();
            formData.append('text', word);
            formData.append('target_lang', 'ES');
            formData.append('source_lang', 'EN');
            formData.append('auth_key', deeplApiKey);

            try {
                const response = await fetch(DEEPL_API_URL, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Error DeepL API: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                if (data.translations && data.translations.length > 0) {
                    sendResponse({ translation: data.translations[0].text });
                } else {
                    sendResponse({ error: "No se encontró traducción." });
                }
            } catch (error) {
                console.error("My HighVocab - Error al traducir en background:", error);
                let errorMessage = `Error de traducción: ${error.message}`;
                if (error.message.includes("403")) {
                    errorMessage = "Error de autenticación. Verifica tu clave DeepL API.";
                }
                sendResponse({ error: errorMessage });
            }
        })(); // Invocamos la función asíncrona inmediatamente
        
        return true; // ¡Este es el return true crucial para el addListener!
                     // Indica que sendResponse será llamado de forma asíncrona.
    }
});