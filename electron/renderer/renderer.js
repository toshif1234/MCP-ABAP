document.addEventListener('DOMContentLoaded', async () => {
  const formFieldsDiv = document.getElementById('formFields');
  const configForm = document.getElementById('configForm');
  const commandInfo = document.getElementById('commandInfo');
  const commandBlock = document.getElementById('commandBlock');
  const copyBtn = document.getElementById('copyBtn');

  // Load schema and existing values
  const schema = await window.electronAPI.getSchema();
  const existingEnv = await window.electronAPI.loadEnv();

  let activeModule = 'abap';

  // Group fields by module
  const abapFields = document.createElement('div');
  abapFields.id = 'abap-fields';
  
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


  // Handle form submission
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(configForm);
    const values = {};
    for (let [key, value] of formData.entries()) {
      values[key] = value;
    }

    await window.electronAPI.saveEnv(values);
    
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
