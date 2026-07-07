document.addEventListener('DOMContentLoaded', async () => {
  const formFieldsDiv = document.getElementById('formFields');
  const configForm = document.getElementById('configForm');
  const commandInfo = document.getElementById('commandInfo');
  const commandBlock = document.getElementById('commandBlock');
  const copyBtn = document.getElementById('copyBtn');

  // Load schema and existing values
  const schema = await window.electronAPI.getSchema();
  const existingEnv = await window.electronAPI.loadEnv();

  let activeModule = 'abap'; // default active module

  // Group fields by module
  const authFieldsContainer = document.getElementById('authFieldsContainer');

  const abapFields = document.createElement('div');
  abapFields.id = 'abap-fields';
  abapFields.style.display = 'block';
  
  const capFields = document.createElement('div');
  capFields.id = 'cap-fields';
  capFields.style.display = 'none';

  // Generate form fields
  schema.forEach(field => {
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = field.key;
    label.textContent = field.label + (field.required ? ' *' : '');

    const input = document.createElement('input');
    input.type = field.type;
    input.id = field.key;
    input.name = field.key;
    
    if (field.required) {
      input.required = true;
    }
    
    // Set value or default
    if (existingEnv[field.key]) {
      input.value = existingEnv[field.key];
    } else if (field.default) {
      input.value = field.default;
    }

    fieldDiv.appendChild(label);
    fieldDiv.appendChild(input);

    if (field.module === 'cap') {
      capFields.appendChild(fieldDiv);
    } else if (field.module === 'auth') {
      authFieldsContainer.appendChild(fieldDiv);
    } else {
      abapFields.appendChild(fieldDiv);
    }
  });

  formFieldsDiv.appendChild(abapFields);
  formFieldsDiv.appendChild(capFields);

  // Handle module switching
  const moduleCards = document.querySelectorAll('.module-card:not(.disabled)');
  moduleCards.forEach(card => {
    card.addEventListener('click', () => {
      // Remove active class and set text to Inactive
      moduleCards.forEach(c => {
        c.classList.remove('active');
        c.querySelector('p').textContent = 'Inactive';
      });
      
      // Add active class and set text to Active
      card.classList.add('active');
      card.querySelector('p').textContent = 'Active';
      
      activeModule = card.dataset.module;
      
      // Toggle form fields
      if (activeModule === 'abap') {
        abapFields.style.display = 'block';
        capFields.style.display = 'none';
      } else if (activeModule === 'cap') {
        abapFields.style.display = 'none';
        capFields.style.display = 'block';
      }
    });
  });

  // Handle auth modal and toggle button logic
  const authToggleBtn = document.getElementById('authToggleBtn');
  const authModal = document.getElementById('authModal');
  const closeAuthModal = document.getElementById('closeAuthModal');
  const authForm = document.getElementById('authForm');

  function updateAuthToggle() {
    if (existingEnv['MCP_USERNAME']) {
      authToggleBtn.textContent = 'Logout';
    } else {
      authToggleBtn.textContent = 'Login';
    }
  }

  updateAuthToggle();

  // Show auth modal on startup if not logged in
  if (!existingEnv['MCP_USERNAME']) {
    authModal.classList.remove('hidden');
  }

  authToggleBtn.addEventListener('click', async () => {
    if (authToggleBtn.textContent === 'Logout') {
      // Logout action
      delete existingEnv['MCP_USERNAME'];
      delete existingEnv['MCP_PASSWORD'];
      
      // Clear auth form fields visually
      document.querySelectorAll('#authForm input').forEach(input => {
        if (input.name === 'MCP_USERNAME' || input.name === 'MCP_PASSWORD') {
          input.value = '';
        }
      });
      
      await window.electronAPI.saveEnv(existingEnv);
      updateAuthToggle();
    } else {
      // Show login modal
      authModal.classList.remove('hidden');
    }
  });

  closeAuthModal.addEventListener('click', () => {
    authModal.classList.add('hidden');
  });

  const authMessage = document.getElementById('authMessage');
  const authSaveBtn = document.getElementById('authSaveBtn');

  function showAuthMessage(msg, type) {
    authMessage.textContent = msg;
    authMessage.className = 'auth-message';
    authMessage.classList.add(type);
    authMessage.classList.remove('hidden');
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(authForm);
    const username = formData.get('MCP_USERNAME');
    const password = formData.get('MCP_PASSWORD');

    const originalText = authSaveBtn.textContent;
    authSaveBtn.textContent = 'Authenticating...';
    authSaveBtn.disabled = true;
    authMessage.classList.add('hidden');

    try {
      const result = await window.electronAPI.authenticateMcp(username, password);
      
      if (result.success) {
        showAuthMessage('Authenticated successfully!', 'success');
        
        for (let [key, value] of formData.entries()) {
          existingEnv[key] = value;
        }
        await window.electronAPI.saveEnv(existingEnv);
        updateAuthToggle();
        
        setTimeout(() => {
          authModal.classList.add('hidden');
          authMessage.classList.add('hidden');
        }, 1500);
      } else {
        showAuthMessage(result.error || 'Authentication failed. Please check your credentials.', 'error');
      }
    } catch (error) {
      showAuthMessage('An error occurred during authentication.', 'error');
    } finally {
      authSaveBtn.textContent = originalText;
      authSaveBtn.disabled = false;
    }
  });


  // Handle form submission
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(configForm);
    for (let [key, value] of formData.entries()) {
      existingEnv[key] = value;
    }

    await window.electronAPI.saveEnv(existingEnv);
    
    const cmdHint = await window.electronAPI.getServerCommandHint();
    const serverConfig = {
      "command": cmdHint.command,
      "args": cmdHint.args,
      "env": cmdHint.env
    };
    
    const updateResult = await window.electronAPI.updateClaudeConfig(serverConfig);
    const infoHeader = commandInfo.querySelector('h3');
    const infoText = commandInfo.querySelector('p');
    
    if (updateResult.success) {
      infoHeader.textContent = 'Configuration Saved and Connected!';
      // infoText.innerHTML = `Successfully added <b>koerber-stellium-SAP-Connector</b> to your Claude Desktop config at:<br><code>${updateResult.path}</code><br><br>Please restart Claude Desktop to apply changes.`;
      commandBlock.style.display = 'none';
      copyBtn.style.display = 'none';
    } else {
      infoHeader.textContent = 'Configuration Saved (Manual Setup Required)';
      infoText.innerHTML = 'We could not automatically find your Claude Desktop configuration file. Please manually add the following JSON to your <code>claude_desktop_config.json</code> under <code>mcpServers</code>:';
      
      const configJson = {
        "koerber-stellium-SAP-Connector": serverConfig
      };
      commandBlock.textContent = JSON.stringify(configJson, null, 2);
      commandBlock.style.display = 'block';
      copyBtn.style.display = 'block';
    }
    
    commandInfo.classList.remove('hidden');
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(commandBlock.textContent);
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 2000);
  });
});
