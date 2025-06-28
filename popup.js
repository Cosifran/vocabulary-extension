document.addEventListener('DOMContentLoaded', function() {
    const apiKeyInput = document.getElementById('deeplApiKey');
    const saveButton = document.getElementById('saveApiKey');
    const statusDiv = document.getElementById('status');

    // Cargar la clave de API guardada al abrir el popup
    chrome.storage.sync.get('deeplApiKey', function(data) {
        if (data.deeplApiKey) {
            apiKeyInput.value = data.deeplApiKey;
            statusDiv.textContent = 'Clave API cargada.';
            statusDiv.className = 'success';
        } else {
            statusDiv.textContent = 'Introduce tu clave DeepL API.';
            statusDiv.className = 'status';
        }
    });

    // Guardar la clave de API cuando se hace clic en el botón
    saveButton.addEventListener('click', function() {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.sync.set({ 'deeplApiKey': apiKey }, function() {
                if (chrome.runtime.lastError) {
                    statusDiv.textContent = 'Error al guardar la clave: ' + chrome.runtime.lastError.message;
                    statusDiv.className = 'error';
                } else {
                    statusDiv.textContent = 'Clave DeepL API guardada correctamente.';
                    statusDiv.className = 'success';
                }
            });
        } else {
            statusDiv.textContent = 'Por favor, introduce una clave API válida.';
            statusDiv.className = 'error';
        }
    });
});