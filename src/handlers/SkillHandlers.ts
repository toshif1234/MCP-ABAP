import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { BaseHandler } from './BaseHandler.js';
import type { ToolDefinition } from '../types/tools.js';

export class SkillHandlers extends BaseHandler {
  getTools(): ToolDefinition[] {
    return [
      {
        name: 'list_skills',
        description: 'Get a list of all available skills for the user. ALWAYS use this first when a user asks to build an application or follow a workflow (e.g., Fiori, CAP) to find the exact skill name.',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'get_skill_md',
        description: 'Fetch the markdown content for a specific skill. After finding the exact skill name using list_skills, use this tool to get the markdown. You MUST analyze this markdown and strictly follow its workflow/instructions to fulfill the user\'s request.',
        inputSchema: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'The exact name of the skill to fetch'
            }
          },
          required: ['skill_name']
        }
      }
    ];
  }

  async handle(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'list_skills':
        return this.handleListSkills(args);
      case 'get_skill_md':
        return this.handleGetSkillMd(args);
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown skill tool: ${toolName}`);
    }
  }

  private async handleListSkills(args: any) {
    const startTime = performance.now();
    try {
      const username = process.env.MCP_USERNAME;
      const password = process.env.MCP_PASSWORD;

      if (!username || !password) {
        throw new Error("Missing MCP_USERNAME or MCP_PASSWORD in environment variables.");
      }

      const skillsResponse = await fetch('https://mcp.cfapps.ap21.hana.ondemand.com/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!skillsResponse.ok) {
        throw new Error(`Failed to fetch skills: ${skillsResponse.statusText}`);
      }

      const skillsData = await skillsResponse.json();
      const skills = Array.isArray(skillsData) ? skillsData : (skillsData.skills || []);

      this.trackRequest(startTime, true);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(skills, null, 2)
        }]
      };
    } catch (error: any) {
      this.trackRequest(startTime, false);
      throw new McpError(
        ErrorCode.InternalError,
        `list_skills failed: ${error.message || 'Unknown error'}`
      );
    }
  }

  private async handleGetSkillMd(args: any) {
    const startTime = performance.now();
    try {
      const username = process.env.MCP_USERNAME;
      const password = process.env.MCP_PASSWORD;
      const skillName = args.skill_name;

      if (!username || !password) {
        throw new Error("Missing MCP_USERNAME or MCP_PASSWORD in environment variables.");
      }

      // Step 1: Fetch all skills to verify if it exists and is active
      const skillsResponse = await fetch('https://mcp.cfapps.ap21.hana.ondemand.com/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!skillsResponse.ok) {
        throw new Error(`Failed to fetch skills: ${skillsResponse.statusText}`);
      }

      const skillsData = await skillsResponse.json();
      const skills = Array.isArray(skillsData) ? skillsData : (skillsData.skills || []);

      const skillMatch = skills.find((s: any) => s.skill_name === skillName);

      if (!skillMatch) {
        this.trackRequest(startTime, true);
        return {
          content: [{
            type: 'text',
            text: `Skill '${skillName}' is not present.`
          }]
        };
      }

      if (skillMatch.status !== 'active') {
        this.trackRequest(startTime, true);
        return {
          content: [{
            type: 'text',
            text: `Skill '${skillName}' is present but inactive (status: ${skillMatch.status}).`
          }]
        };
      }

      // Step 2: Fetch the skill MD
      const mdResponse = await fetch('https://mcp.cfapps.ap21.hana.ondemand.com/api/getSkillMD', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, skill_name: skillName })
      });

      if (!mdResponse.ok) {
        throw new Error(`Failed to fetch skill MD: ${mdResponse.statusText}`);
      }

      const mdData = await mdResponse.json();
      
      this.trackRequest(startTime, true);
      
      const mdContent = mdData.content || JSON.stringify(mdData);

      return {
        content: [{
          type: 'text',
          text: mdContent
        }]
      };

    } catch (error: any) {
      this.trackRequest(startTime, false);
      throw new McpError(
        ErrorCode.InternalError,
        `get_skill_md failed: ${error.message || 'Unknown error'}`
      );
    }
  }
}
