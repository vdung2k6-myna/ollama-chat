document.addEventListener('DOMContentLoaded', () => {
    const userPane = document.getElementById('user-pane');
    const botPane = document.getElementById('bot-pane');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsPane = document.getElementById('settings-pane');
    const modelSelect = document.getElementById('model-select');
    const splitter = document.getElementById('splitter');
    const chatContainer = document.getElementById('chat-container');

    // Fetch Ollama models and populate the combobox
    async function fetchModels() {
        try {
            const response = await fetch('http://localhost:3000/models');
            const data = await response.json();
            if (data.models) {
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    modelSelect.appendChild(option);
                });
                // Select the first model by default
                if (data.models.length > 0) {
                    modelSelect.value = data.models[0].name;
                }
            }
        } catch (error) {
            console.error('Error fetching models:', error);
            alert('Could not connect to Ollama. Please ensure the server is running and Ollama is accessible.');
        }
    }

    fetchModels();

    settingsToggle.addEventListener('click', () => {
        settingsPane.classList.toggle('expanded');
        if (settingsPane.classList.contains('expanded')) {
            settingsToggle.textContent = '>';
        } else {
            settingsToggle.textContent = '<';
        }
    });

    const quill = new Quill(botPane, {
        theme: 'snow',
        readOnly: true,
        modules: {
            toolbar: false
        }
    });

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    clearButton.addEventListener('click', () => {
        userPane.innerHTML = '';
        quill.setContents([]);
    });

    // Make splitter draggable
    let isDragging = false;
    
    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const containerRect = chatContainer.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const mouseX = e.clientX - containerRect.left;
        
        // Calculate percentages for pane widths
        const userPaneWidth = (mouseX / containerWidth) * 100;
        const botPaneWidth = 100 - userPaneWidth;
        
        // Ensure panes don't become too small
        if (userPaneWidth > 20 && userPaneWidth < 80) {
            userPane.style.width = userPaneWidth + '%';
            // Get the bot pane container element directly
            const botPaneContainer = document.getElementById('bot-pane-container');
            botPaneContainer.style.width = botPaneWidth + '%';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.cursor = 'default';
    });

    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '') return;

        const selectedModel = modelSelect.value; // Get the selected model

        appendMessage(userPane, 'user-message', message);
        userInput.value = '';

        try {
            const requestBody = {
                message: message,
                model: selectedModel,
            };

            const response = await fetch('http://localhost:3000/chat', {
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

            quill.setContents([{ insert: '. .' }]);
            const data = await response.json();
            quill.setContents([{ insert: data.response }]);
            
        } catch (error) {
            console.error('Error:', error);
            appendMessage(botPane, 'bot-message', 'Error connecting to the server.');
        }
    }

    function appendMessage(pane, className, text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add(className);
        messageElement.innerHTML = text; // Use innerHTML to display image
        pane.appendChild(messageElement);
        pane.scrollTop = pane.scrollHeight;
    }
});