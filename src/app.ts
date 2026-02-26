/// <reference path="./types/marked.d.ts" />

// Authentication state
let currentUser: any = null;
let currentToken: string = '';
let supabaseClient: any = null;
let supabaseInitialized = false;

// Initialize Supabase client (singleton)
async function initSupabase() {
    if (supabaseInitialized) return;
    
    try {
        // Fetch Supabase config from backend
        const configResponse = await fetch('/auth/github');
        const config = await configResponse.json();
        
        // @ts-ignore - supabase is loaded from CDN
        supabaseClient = supabase.createClient(
            config.supabaseUrl,
            config.supabaseAnonKey,
            {
                auth: {
                    flowType: 'pkce',
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    persistSession: true
                }
            }
        );
        supabaseInitialized = true;
        return true;
    } catch (error) {
        console.error('Error initializing Supabase:', error);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase first
    await initSupabase();
    
    const authContainer = document.getElementById('auth-container') as HTMLElement;
    const chatContainer = document.getElementById('chat-container') as HTMLElement;
    const loginForm = document.getElementById('login-form') as HTMLElement;
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
    const signupBtn = document.getElementById('signup-btn') as HTMLButtonElement;
    const githubLoginBtn = document.getElementById('github-login-btn') as HTMLButtonElement;
    const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
    const loginErrors = document.getElementById('login-errors') as HTMLElement;
    const authStatus = document.getElementById('auth-status') as HTMLElement;

    // Chat elements
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
    const chatContainerElement = document.getElementById('chat-container') as HTMLElement;

    // Bot message element for displaying responses
    let currentBotMessage: HTMLElement | null = null;

    // Conversation history for context (user and assistant messages only)
    let conversationHistory: Array<{ role: string; content: string }> = [];
    // System message (not part of conversation history)
    let currentSystemMessage: string = '';

    // Show login form initially
    showLoginForm();
    //showChatInterface(); // Show chat interface for testing without auth (remove in production)

    // GitHub OAuth handler
    githubLoginBtn.addEventListener('click', async () => {
        try {
            const { data, error } = await supabaseClient.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: `${window.location.origin}/`,
                }
            });

            if (error) {
                showError(error.message || 'GitHub login failed');
                return;
            }
        } catch (error) {
            console.error('GitHub login error:', error);
            showError('An error occurred during GitHub login');
        }
    });

    // Check for OAuth callback and handle session
    supabaseClient.auth.onAuthStateChange((event: string, session: any) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            currentToken = session.access_token;
            authStatus.textContent = `Welcome, ${currentUser.user_metadata?.user_name || currentUser.email}`;
            showChatInterface();
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

    // Show login form and hide chat
    function showLoginForm() {
        authContainer.style.display = 'flex';
        chatContainer.style.display = 'none';
        loginForm.style.display = 'block';
        logoutBtn.style.display = 'none';
        settingsPane.style.display = 'none';
        settingsToggle.style.display = 'none';
        
        // Hide input container
        const inputContainer = document.getElementById('input-container');
        if (inputContainer) {
            inputContainer.style.display = 'none';
        }
    }

    // Show chat interface and hide login form
    function showChatInterface() {
        authContainer.style.display = 'none';
        chatContainer.style.display = 'flex';
        logoutBtn.style.display = 'block';
        settingsPane.style.display = 'block';
        settingsToggle.style.display = 'block';
        
        // Show input container
        const inputContainer = document.getElementById('input-container');
        if (inputContainer) {
            inputContainer.style.display = 'flex';
        }
        
        fetchModels();
    }

    // Login event handlers
    loginBtn?.addEventListener('click', async () => {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value.trim();

        if (!email || !password) {
            showError('Please enter both email and password');
            return;
        }

        try {
            const response = await fetch('/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            console.log('Login response:', { status: response.status, data });

            if (!response.ok) {
                showError(data.error || `Login failed (${response.status})`);
                return;
            }

            // Store user and token
            currentUser = data.user;
            currentToken = data.session.access_token;
            authStatus.textContent = `Welcome, ${currentUser.email}`;
            showChatInterface();
            clearLoginFields();
        } catch (error) {
            console.error('Login error:', error);
            showError('An error occurred during login');
        }
    });

    // Signup event handler
    signupBtn?.addEventListener('click', async () => {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value.trim();

        if (!email || !password) {
            showError('Please enter both email and password');
            return;
        }

        try {
            const response = await fetch('/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                showError(data.error || 'Signup failed');
                return;
            }

            // If there's no session, email confirmation is required
            if (!data.session) {
                showError(data.message || 'Signup successful! Please check your email to confirm your account.');
                clearLoginFields();
                return;
            }

            // Store user and token
            currentUser = data.user;
            currentToken = data.session.access_token;
            authStatus.textContent = `Welcome, ${currentUser.email}`;
            showChatInterface();
            clearLoginFields();
        } catch (error) {
            console.error('Signup error:', error);
            showError('An error occurred during signup');
        }
    });

    // Logout handler
    logoutBtn?.addEventListener('click', async () => {
        try {
            // Sign out from Supabase on the client
            if (supabaseClient) {
                await supabaseClient.auth.signOut();
            }

            // Sign out from backend
            const response = await fetch('/auth/signout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`,
                },
            });

            // Clear state regardless of response
            currentUser = null;
            currentToken = '';
            
            // Clear conversation history and chat UI
            conversationHistory = [];
            userPane.innerHTML = '';
            botPane.innerHTML = '';
            userInput.value = '';
            systemMessageInput.value = '';
            currentSystemMessage = '';
            
            // Show login form
            showLoginForm();
            authStatus.textContent = '';
            
            if (!response.ok) {
                console.warn('Backend logout response not ok:', response.status);
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Still consider it a logout on client even if server fails
            currentUser = null;
            currentToken = '';
            conversationHistory = [];
            userPane.innerHTML = '';
            botPane.innerHTML = '';
            showLoginForm();
            authStatus.textContent = '';
            showError('Logged out (server error, but session cleared locally)');
        }
    });

    // Clear login form fields
    function clearLoginFields() {
        emailInput.value = '';
        passwordInput.value = '';
    }

    // Show error message
    function showError(message: string) {
        loginErrors.textContent = message;
        setTimeout(() => {
            loginErrors.textContent = '';
        }, 5000);
    }

    // Settings toggle
    settingsToggle?.addEventListener('click', () => {
        settingsPane.classList.toggle('expanded');
        if (settingsPane.classList.contains('expanded')) {
            settingsToggle.textContent = '>';
        } else {
            settingsToggle.textContent = '<';
        }
    });

    // Event listeners
    sendButton?.addEventListener('click', sendMessage);
    userInput?.addEventListener('keypress', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Draggable splitter
    let isDragging = false;
    splitter?.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const containerRect = chatContainerElement.getBoundingClientRect();
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
    clearButton?.addEventListener('click', () => {
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
                    'Authorization': `Bearer ${currentToken}`,
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

    // Check for existing session on page load (handles OAuth callback)
    async function checkExistingSession() {
        try {
            // Initialize Supabase first
            const initialized = await initSupabase();
            if (!initialized) {
                return;
            }

            // Check for error in URL
            const urlParams = new URLSearchParams(window.location.search);
            const error = urlParams.get('error');
            const errorDescription = urlParams.get('error_description');

            if (error) {
                showError(`GitHub login failed: ${errorDescription || error}`);
                // Clear the URL parameters
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }

            // Get session from Supabase (handles OAuth callback automatically with detectSessionInUrl)
            const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

            if (sessionError) {
                console.error('Error getting session:', sessionError);
                return;
            }

            if (session) {
                // User is logged in
                currentUser = session.user;
                currentToken = session.access_token;
                authStatus.textContent = `Welcome, ${currentUser.email || currentUser.user_metadata?.user_name || 'GitHub User'}`;
                showChatInterface();
                // Clear any URL parameters after successful auth
                if (window.location.search) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
        } catch (error) {
            console.error('Error checking session:', error);
        }
    }

    // Run session check on page load
    checkExistingSession();
});
