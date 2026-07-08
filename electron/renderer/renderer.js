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

  const githubFields = document.createElement('div');
  githubFields.id = 'github-fields';
  githubFields.style.display = 'none';

  const skillsFields = document.createElement('div');
  skillsFields.id = 'skills-fields';
  skillsFields.style.display = 'none';
  skillsFields.innerHTML = `
    <div style="margin-bottom: 20px;">
      <button type="button" id="fetchSkillsBtn" class="primary-btn">Fetch Skills</button>
    </div>
    <div id="skillsMessage" class="auth-message hidden" style="margin-bottom: 20px;"></div>
    <div id="skillsTableContainer" class="hidden">
      <table id="skillsTable" style="width: 100%; text-align: left; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <thead style="background: #f1f3f4;">
          <tr>
            <th style="padding: 12px 15px; border-bottom: 2px solid #e0e0e0; font-weight: 500;">Skill Name</th>
            <th style="padding: 12px 15px; border-bottom: 2px solid #e0e0e0; font-weight: 500;">Uploaded Date</th>
            <th style="padding: 12px 15px; border-bottom: 2px solid #e0e0e0; font-weight: 500;">Status</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

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
    } else if (field.module === 'github') {
      githubFields.appendChild(fieldDiv);
    } else if (field.module === 'auth') {
      authFieldsContainer.appendChild(fieldDiv);
    } else {
      abapFields.appendChild(fieldDiv);
    }
  });

  formFieldsDiv.appendChild(abapFields);
  formFieldsDiv.appendChild(capFields);
  formFieldsDiv.appendChild(githubFields);
  formFieldsDiv.appendChild(skillsFields);

  // Handle module switching
  const moduleCards = document.querySelectorAll('.module-card:not(.disabled)');
  moduleCards.forEach(card => {
    card.addEventListener('click', () => {
      // Remove active class
      moduleCards.forEach(c => {
        c.classList.remove('active');
      });
      
      // Add active class
      card.classList.add('active');
      
      activeModule = card.dataset.module;
      
      // Toggle form fields
      const abapTestContainer = document.getElementById('abapTestContainer');
      const capTestContainer = document.getElementById('capTestContainer');
      const githubTestContainer = document.getElementById('githubTestContainer');
      const saveBtnContainer = document.getElementById('formActions');
      
      if (activeModule === 'abap') {
        abapFields.style.display = 'block';
        capFields.style.display = 'none';
        githubFields.style.display = 'none';
        skillsFields.style.display = 'none';
        if (abapTestContainer) abapTestContainer.style.display = 'flex';
        if (capTestContainer) capTestContainer.style.display = 'none';
        if (githubTestContainer) githubTestContainer.style.display = 'none';
        saveBtnContainer.style.display = 'flex';
      } else if (activeModule === 'cap') {
        abapFields.style.display = 'none';
        capFields.style.display = 'block';
        githubFields.style.display = 'none';
        skillsFields.style.display = 'none';
        if (abapTestContainer) abapTestContainer.style.display = 'none';
        if (capTestContainer) capTestContainer.style.display = 'flex';
        if (githubTestContainer) githubTestContainer.style.display = 'none';
        saveBtnContainer.style.display = 'flex';
      } else if (activeModule === 'github') {
        abapFields.style.display = 'none';
        capFields.style.display = 'none';
        githubFields.style.display = 'block';
        skillsFields.style.display = 'none';
        if (abapTestContainer) abapTestContainer.style.display = 'none';
        if (capTestContainer) capTestContainer.style.display = 'none';
        if (githubTestContainer) githubTestContainer.style.display = 'flex';
        saveBtnContainer.style.display = 'flex';
      } else if (activeModule === 'skills') {
        abapFields.style.display = 'none';
        capFields.style.display = 'none';
        githubFields.style.display = 'none';
        skillsFields.style.display = 'block';
        if (abapTestContainer) abapTestContainer.style.display = 'none';
        if (capTestContainer) capTestContainer.style.display = 'none';
        if (githubTestContainer) githubTestContainer.style.display = 'none';
        saveBtnContainer.style.display = 'none';
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

  const fetchSkillsBtn = skillsFields.querySelector('#fetchSkillsBtn');
  const skillsTableContainer = skillsFields.querySelector('#skillsTableContainer');
  const skillsTableBody = skillsFields.querySelector('#skillsTable tbody');
  const skillsMessage = skillsFields.querySelector('#skillsMessage');

  fetchSkillsBtn.addEventListener('click', async () => {
    fetchSkillsBtn.disabled = true;
    fetchSkillsBtn.textContent = 'Fetching...';
    skillsMessage.classList.add('hidden');
    skillsTableContainer.classList.add('hidden');

    try {
      const username = existingEnv['MCP_USERNAME'] || '';
      const password = existingEnv['MCP_PASSWORD'] || '';
      
      if (!username || !password) {
        skillsMessage.className = 'auth-message error';
        skillsMessage.textContent = 'Please login first using the Login button.';
        skillsMessage.classList.remove('hidden');
        return;
      }

      const result = await window.electronAPI.fetchSkills(username, password);
      
      if (result.success) {
        skillsTableBody.innerHTML = '';
        const data = Array.isArray(result.data) ? result.data : (result.data?.skills || []);
        
        if (data.length > 0) {
          data.forEach(skill => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #e0e0e0';
            
            const nameTd = document.createElement('td');
            nameTd.style.padding = '12px 15px';
            nameTd.textContent = skill.skill_name || skill.name || 'N/A';
            
            const dateTd = document.createElement('td');
            dateTd.style.padding = '12px 15px';
            let dateStr = skill.Uploaded_Date || skill.uploadedDate || 'N/A';
            if (dateStr !== 'N/A') {
              try {
                const d = new Date(dateStr);
                dateStr = d.toLocaleString();
              } catch (e) {}
            }
            dateTd.textContent = dateStr;
            
            const statusTd = document.createElement('td');
            statusTd.style.padding = '12px 15px';
            
            // Adding a small badge style for status
            let statusColor = '#555';
            let statusBg = '#eee';
            if (skill.status === 'active') {
              statusColor = '#2e7d32';
              statusBg = '#e8f5e9';
            } else if (skill.status === 'expired') {
              statusColor = '#c62828';
              statusBg = '#ffebee';
            }
            statusTd.innerHTML = `<span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; text-transform: uppercase;">${skill.status || 'N/A'}</span>`;
            
            tr.appendChild(nameTd);
            tr.appendChild(dateTd);
            tr.appendChild(statusTd);
            skillsTableBody.appendChild(tr);
          });
        } else {
          skillsTableBody.innerHTML = '<tr><td colspan="3" style="padding: 12px 15px; text-align: center; color: #666;">No skills found.</td></tr>';
        }
        skillsTableContainer.classList.remove('hidden');
      } else {
        skillsMessage.className = 'auth-message error';
        skillsMessage.textContent = result.error || 'Failed to fetch skills.';
        skillsMessage.classList.remove('hidden');
      }
    } catch (e) {
      skillsMessage.className = 'auth-message error';
      skillsMessage.textContent = 'An error occurred while fetching skills.';
      skillsMessage.classList.remove('hidden');
    } finally {
      fetchSkillsBtn.disabled = false;
      fetchSkillsBtn.textContent = 'Fetch Skills';
    }
  });


  const testAbapBtn = document.getElementById('testAbapBtn');
  const abapTestStatus = document.getElementById('abapTestStatus');
  const abapStatusText = abapTestStatus.querySelector('.status-text');

  function updateModuleStatus(moduleName, status, color) {
    const card = document.querySelector(`.module-card[data-module="${moduleName}"]`);
    if (card) {
      const p = card.querySelector('p');
      if (p) {
        p.textContent = status;
        p.style.color = color || '';
      }
    }
  }

  testAbapBtn.addEventListener('click', async () => {
    const formData = new FormData(configForm);
    const config = {
      SAP_URL: formData.get('SAP_URL'),
      SAP_USER: formData.get('SAP_USER'),
      SAP_PASSWORD: formData.get('SAP_PASSWORD'),
      SAP_CLIENT: formData.get('SAP_CLIENT'),
      SAP_LANGUAGE: formData.get('SAP_LANGUAGE')
    };

    if (!config.SAP_URL || !config.SAP_USER || !config.SAP_PASSWORD) {
      abapTestStatus.className = 'test-status status-error';
      abapStatusText.textContent = 'Missing Fields';
      testAbapBtn.textContent = 'Retest';
      abapTestStatus.classList.remove('hidden');
      return;
    }

    testAbapBtn.textContent = 'Testing...';
    testAbapBtn.disabled = true;
    abapTestStatus.classList.add('hidden');

    try {
      const result = await window.electronAPI.testAbapConnection(config);
      
      abapTestStatus.classList.remove('hidden');
      if (result.success) {
        abapTestStatus.className = 'test-status status-success';
        abapStatusText.textContent = 'Connected';
        updateModuleStatus('abap', 'Connected', '#2e7d32');
      } else {
        abapTestStatus.className = 'test-status status-error';
        abapStatusText.textContent = 'Connection Error';
        updateModuleStatus('abap', 'Connection Error', '#c62828');
      }
    } catch (error) {
      abapTestStatus.classList.remove('hidden');
      abapTestStatus.className = 'test-status status-error';
      abapStatusText.textContent = 'Connection Error';
      updateModuleStatus('abap', 'Connection Error', '#c62828');
    } finally {
      testAbapBtn.textContent = 'Retest';
      testAbapBtn.disabled = false;
    }
  });

  const testCapBtn = document.getElementById('testCapBtn');
  const capTestStatus = document.getElementById('capTestStatus');
  const capStatusText = capTestStatus.querySelector('.status-text');

  testCapBtn.addEventListener('click', async () => {
    const formData = new FormData(configForm);
    const config = {
      CF_API: formData.get('CF_API'),
      CF_USERNAME: formData.get('CF_USERNAME'),
      CF_PASSWORD: formData.get('CF_PASSWORD')
    };

    if (!config.CF_API) {
      capTestStatus.className = 'test-status status-error';
      capStatusText.textContent = 'Missing API URL';
      testCapBtn.textContent = 'Retest';
      capTestStatus.classList.remove('hidden');
      return;
    }

    testCapBtn.textContent = 'Testing...';
    testCapBtn.disabled = true;
    capTestStatus.classList.add('hidden');

    try {
      const result = await window.electronAPI.testCapConnection(config);
      
      capTestStatus.classList.remove('hidden');
      if (result.success) {
        capTestStatus.className = 'test-status status-success';
        capStatusText.textContent = 'Connected';
        updateModuleStatus('cap', 'Connected', '#2e7d32');
      } else {
        capTestStatus.className = 'test-status status-error';
        capStatusText.textContent = 'Connection Error';
        updateModuleStatus('cap', 'Connection Error', '#c62828');
      }
    } catch (error) {
      capTestStatus.classList.remove('hidden');
      capTestStatus.className = 'test-status status-error';
      capStatusText.textContent = 'Connection Error';
      updateModuleStatus('cap', 'Connection Error', '#c62828');
    } finally {
      testCapBtn.textContent = 'Retest';
      testCapBtn.disabled = false;
    }
  });

  const testGithubBtn = document.getElementById('testGithubBtn');
  const githubTestStatus = document.getElementById('githubTestStatus');
  const githubStatusText = githubTestStatus.querySelector('.status-text');

  testGithubBtn.addEventListener('click', async () => {
    const formData = new FormData(configForm);
    const config = {
      GITHUB_TOKEN: formData.get('GITHUB_TOKEN')
    };

    if (!config.GITHUB_TOKEN) {
      githubTestStatus.className = 'test-status status-error';
      githubStatusText.textContent = 'Missing Token';
      testGithubBtn.textContent = 'Retest';
      githubTestStatus.classList.remove('hidden');
      return;
    }

    testGithubBtn.textContent = 'Testing...';
    testGithubBtn.disabled = true;
    githubTestStatus.classList.add('hidden');

    try {
      const result = await window.electronAPI.testGithubConnection(config);
      
      githubTestStatus.classList.remove('hidden');
      if (result.success) {
        githubTestStatus.className = 'test-status status-success';
        githubStatusText.textContent = 'Connected';
        updateModuleStatus('github', 'Connected', '#2e7d32');
      } else {
        githubTestStatus.className = 'test-status status-error';
        githubStatusText.textContent = 'Connection Error';
        updateModuleStatus('github', 'Connection Error', '#c62828');
      }
    } catch (error) {
      githubTestStatus.classList.remove('hidden');
      githubTestStatus.className = 'test-status status-error';
      githubStatusText.textContent = 'Connection Error';
      updateModuleStatus('github', 'Connection Error', '#c62828');
    } finally {
      testGithubBtn.textContent = 'Retest';
      testGithubBtn.disabled = false;
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
      infoText.innerHTML = `Please restart Claude Desktop to apply changes.`;
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
