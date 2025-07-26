#!/usr/bin/env node
import { ObsidianAPIClient } from './src/obsidian-api-client.js';

async function testAPIIntegration() {
  console.log('Testing Obsidian API integration...\n');
  
  const apiClient = new ObsidianAPIClient();
  
  // Wait a bit for initial availability check
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('1. Checking API availability...');
  console.log(`   API Available: ${apiClient.isAvailable()}`);
  
  if (!apiClient.isAvailable()) {
    console.log('\n⚠️  Obsidian API server is not available.');
    console.log('   Make sure Obsidian is running with the AI Curator plugin enabled');
    console.log('   and the API server is enabled in plugin settings.\n');
    return;
  }
  
  console.log('\n2. Testing health endpoint...');
  const health = await apiClient.request('/health');
  console.log('   Health:', JSON.stringify(health, null, 2));
  
  console.log('\n3. Testing vault info...');
  const vaultInfo = await apiClient.getVaultInfo();
  console.log('   Vault Info:', JSON.stringify(vaultInfo, null, 2));
  
  console.log('\n4. Testing search...');
  const searchResults = await apiClient.search('test', { maxResults: 3 });
  console.log('   Search Results:', searchResults ? `Found ${searchResults.length} results` : 'No results');
  
  console.log('\n5. Testing tags...');
  const tags = await apiClient.getTags();
  console.log('   Tags:', tags ? Object.keys(tags.tags || {}).slice(0, 5).join(', ') + '...' : 'No tags');
  
  console.log('\n✅ API integration test complete!\n');
}

testAPIIntegration().catch(console.error);