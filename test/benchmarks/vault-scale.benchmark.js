#!/usr/bin/env node

/**
 * Performance Benchmark: Vault Scaling
 * 
 * Tests how tools perform with increasingly large vaults
 */

import { SimpleTestHarness } from '../test-harness-simple.js';

async function benchmark() {
  console.log('🚀 Vault Scaling Benchmark\n');
  
  const harness = new SimpleTestHarness();
  const results = [];
  const sizes = [100, 500, 1000, 5000, 10000];
  
  for (const size of sizes) {
    console.log(`\n📊 Testing with ${size} notes...`);
    
    await harness.setup();
    
    // Create large vault
    const vault = {};
    for (let i = 0; i < size; i++) {
      const folder = `Folder${Math.floor(i / 100)}`;
      vault[`${folder}/Note${i}.md`] = {
        content: `# Note ${i}\n\nThis note contains #tag${i % 10} and links to [[Note${(i + 1) % size}]].\n\n${'Lorem ipsum '.repeat(50)}`,
        frontmatter: {
          tags: [`category${i % 5}`, `type${i % 3}`],
          created: new Date(Date.now() - i * 86400000).toISOString(),
          wordCount: 100 + (i % 50)
        }
      };
    }
    
    console.log('  Creating vault...');
    const createStart = Date.now();
    await harness.createTestVault(vault);
    const createTime = Date.now() - createStart;
    
    // Benchmark vault_scan
    console.log('  Benchmarking vault_scan...');
    const scanStart = Date.now();
    const scanResult = await harness.executeTool('vault_scan', {
      includeStats: true,
      includeFrontmatter: true
    });
    const scanTime = Date.now() - scanStart;
    
    // Benchmark search_content
    console.log('  Benchmarking search_content...');
    const searchStart = Date.now();
    const searchResult = await harness.executeTool('search_content', {
      query: 'Lorem ipsum'
    });
    const searchTime = Date.now() - searchStart;
    
    // Benchmark get_tags
    console.log('  Benchmarking get_tags...');
    const tagsStart = Date.now();
    const tagsResult = await harness.executeTool('get_tags');
    const tagsTime = Date.now() - tagsStart;
    
    results.push({
      size,
      createTime,
      scanTime,
      searchTime,
      tagsTime,
      filesFound: scanResult.files.length,
      matchesFound: searchResult.matches.length,
      uniqueTags: Object.keys(tagsResult.tags).length
    });
    
    await harness.teardown();
  }
  
  // Print results table
  console.log('\n📈 Benchmark Results\n');
  console.log('Size  | Create  | Scan    | Search  | Tags    | Files | Matches | Tags');
  console.log('------|---------|---------|---------|---------|-------|---------|-----');
  
  results.forEach(r => {
    console.log(
      `${r.size.toString().padEnd(5)} | ` +
      `${r.createTime.toString().padEnd(7)} | ` +
      `${r.scanTime.toString().padEnd(7)} | ` +
      `${r.searchTime.toString().padEnd(7)} | ` +
      `${r.tagsTime.toString().padEnd(7)} | ` +
      `${r.filesFound.toString().padEnd(5)} | ` +
      `${r.matchesFound.toString().padEnd(7)} | ` +
      `${r.uniqueTags}`
    );
  });
  
  // Analyze scaling
  console.log('\n📊 Scaling Analysis\n');
  
  const scanScaling = results[results.length - 1].scanTime / results[0].scanTime;
  const searchScaling = results[results.length - 1].searchTime / results[0].searchTime;
  const sizeScaling = results[results.length - 1].size / results[0].size;
  
  console.log(`Vault size increased: ${sizeScaling}x`);
  console.log(`Scan time increased: ${scanScaling.toFixed(2)}x`);
  console.log(`Search time increased: ${searchScaling.toFixed(2)}x`);
  
  if (scanScaling < sizeScaling) {
    console.log('✅ Scan scales sub-linearly (good!)');
  } else {
    console.log('⚠️  Scan scales linearly or worse');
  }
  
  if (searchScaling < sizeScaling) {
    console.log('✅ Search scales sub-linearly (good!)');
  } else {
    console.log('⚠️  Search scales linearly or worse');
  }
  
  // Performance targets
  console.log('\n🎯 Performance Targets\n');
  
  const finalResult = results[results.length - 1];
  console.log(`10k notes vault scan: ${finalResult.scanTime}ms (target: <1000ms)`);
  console.log(`10k notes search: ${finalResult.searchTime}ms (target: <2000ms)`);
  console.log(`10k notes tag analysis: ${finalResult.tagsTime}ms (target: <500ms)`);
}

// Run benchmark
benchmark().catch(console.error);