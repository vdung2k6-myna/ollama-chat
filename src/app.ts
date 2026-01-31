declare const Quill: any;

document.addEventListener('DOMContentLoaded', () => {
    const userPane = document.getElementById('user-pane') as HTMLElement;
    const botPane = document.getElementById('bot-pane') as HTMLElement;
    const userInput = document.getElementById('user-input') as HTMLInputElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-button') as HTMLButtonElement;
    const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
    const settingsPane = document.getElementById('settings-pane') as HTMLElement;
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const splitter = document.getElementById('splitter') as HTMLElement;
    const chatContainer = document.getElementById('chat-container') as HTMLElement;

    // Initialize Quill for the bot pane
    const quill = new Quill(botPane, {
        theme: 'snow',
        readOnly: true,
        modules: {
            toolbar: false
        }
    });

    // Fetch Ollama models and populate the combobox
    async function fetchModels() {
        try {
            const response = await fetch('/models');
            const data = await response.json();
            if (data.models) {
                data.models.forEach((model: { name: string }) => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    modelSelect.appendChild(option);
                });
                if (data.models.length > 0) {
                    modelSelect.value = data.models[0].name;
                }
            }
        } catch (error) {
            console.error('Error fetching models:', error);
        }
    }

    fetchModels();

    // Settings toggle
    settingsToggle.addEventListener('click', () => {
        settingsPane.classList.toggle('expanded');
        if (settingsPane.classList.contains('expanded')) {
            settingsToggle.textContent = '>';
        } else {
            settingsToggle.textContent = '<';
        }
    });

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Draggable splitter
    let isDragging = false;
    splitter.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const containerRect = chatContainer.getBoundingClientRect();
        const userPaneWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        const botPaneWidth = 100 - userPaneWidth;
        if (userPaneWidth > 20 && userPaneWidth < 80) {
            userPane.style.width = userPaneWidth + '%';
            const botPaneContainer = document.getElementById('bot-pane-container') as HTMLElement;
            botPaneContainer.style.width = botPaneWidth + '%';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    });

    // Send message with streaming
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '')
            return;
        const selectedModel = modelSelect.value; // Get the selected model
        appendMessage(userPane, 'user-message', message);
        userInput.value = '';
        try {
            const requestBody = {
                message: message,
                model: selectedModel,
            };
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });
            if (!response.ok) {
                const errorData = await response.json();
                appendMessage(botPane, 'bot-message', `Error: ${errorData.error || 'Unknown error'}`);
                return;
            }
            quill.setContents([
                { insert: '. . .' }
            ]);
            const data = await response.json();
            quill.setContents([
                { insert: `<thinking> ${data.thinking}` },
                { insert: data.response }
            ]);
        }
        catch (error) {
            console.error('Error:', error);
            appendMessage(botPane, 'bot-message', 'Error connecting to the server.');
        }
    }

    function appendMessage(pane: HTMLElement, className: string, text: string) {
        const messageElement = document.createElement('div');
        messageElement.classList.add(className);
        messageElement.innerHTML = text; // Use innerHTML to display image
        pane.appendChild(messageElement);
        pane.scrollTop = pane.scrollHeight;
    }

});
