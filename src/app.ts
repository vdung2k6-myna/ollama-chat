/// <reference path="./types/marked.d.ts" />

document.addEventListener('DOMContentLoaded', () => {
    const userPane = document.getElementById('user-pane') as HTMLElement;
    const botPane = document.getElementById('bot-pane') as HTMLElement;
    const userInput = document.getElementById('user-input') as HTMLInputElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    const clearButton = document.getElementById('clear-button') as HTMLButtonElement;
    const settingsToggle = document.getElementById('settings-toggle') as HTMLButtonElement;
    const settingsPane = document.getElementById('settings-pane') as HTMLElement;
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const systemMessageInput = document.getElementById('system-message') as HTMLTextAreaElement;
    const splitter = document.getElementById('splitter') as HTMLElement;
    const chatContainer = document.getElementById('chat-container') as HTMLElement;

    // Bot message element for displaying responses
    let currentBotMessage: HTMLElement | null = null;

    // Conversation history for context (user and assistant messages only)
    let conversationHistory: Array<{ role: string; content: string }> = [];
    // System message (not part of conversation history)
    let currentSystemMessage: string = '';

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

    // Clear conversation
    clearButton.addEventListener('click', () => {
        userPane.innerHTML = '';
        botPane.innerHTML = '';
        conversationHistory = [];
        userInput.value = '';
        systemMessageInput.value = '';
        currentSystemMessage = '';
        userInput.focus();
    });

    // Send message with streaming
    async function sendMessage() {
        const message = userInput.value.trim();
        if (message === '')
            return;
        const selectedModel = modelSelect.value; // Get the selected model

        // Capture system message (only update if user provided one)
        const systemMessage = systemMessageInput.value.trim();
        if (systemMessage !== '') {
            currentSystemMessage = systemMessage;
        }

        // Add user message to conversation history
        conversationHistory.push({ role: 'user', content: message });

        appendMessage(userPane, 'user-message', message);
        userInput.value = '';
        try {
            const requestBody = {
                message: message,
                model: selectedModel,
                messages: conversationHistory,
                systemMessage: currentSystemMessage,
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
            
            // Create a new bot message element for the streaming response
            currentBotMessage = document.createElement('div');
            currentBotMessage.classList.add('bot-message');
            currentBotMessage.innerHTML = '. . .';
            botPane.appendChild(currentBotMessage);
            botPane.scrollTop = botPane.scrollHeight;
            
            // Process the streaming response
            if (response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullResponse = '';
                let fullThinking = '';
                let buffer = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    // Append new data to buffer
                    buffer += decoder.decode(value, { stream: true });
                    
                    // Split by newlines and process complete lines
                    const lines = buffer.split('\n');
                    // Keep the last partial line in the buffer
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;

                        try {
                            const chunk = JSON.parse(line);

                            // Handle chat API response format (message.content)
                            if (chunk.message && chunk.message.content) {
                                fullResponse += chunk.message.content;
                                if (currentBotMessage) {
                                    currentBotMessage.innerHTML = window.marked.parse(fullResponse);
                                    botPane.scrollTop = botPane.scrollHeight;
                                }
                            }
                            // Handle thinking content (if supported)
                            if (chunk.thinking) {
                                fullThinking += chunk.thinking;
                            }
                        } catch (e) {
                            console.error('Error parsing chunk:', line, e);
                        }
                    }
                }
                
                // Process any remaining data in buffer
                if (buffer.trim() !== '') {
                    try {
                        const chunk = JSON.parse(buffer);
                        if (chunk.message && chunk.message.content) {
                            fullResponse += chunk.message.content;
                        }
                        if (chunk.thinking) {
                            fullThinking += chunk.thinking;
                        }
                    } catch (e) {
                        console.error('Error parsing final chunk:', buffer, e);
                    }
                }

                if (currentBotMessage) {
                    currentBotMessage.innerHTML = window.marked.parse(fullResponse);
                    botPane.scrollTop = botPane.scrollHeight;
                }

                // Add assistant response to conversation history
                if (fullResponse.trim() !== '') {
                    conversationHistory.push({ role: 'assistant', content: fullResponse });
                }
            }
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
