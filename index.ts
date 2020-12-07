#!/usr/bin/env ts-node-script

import { join } from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { Octokit } from '@octokit/rest';
import * as AWS from 'aws-sdk';
import simpleGit from 'simple-git';

const pan = process.env.GITHUB_PAN;
if (!pan) throw new Error('requires GITHUB_PAN');

const octokit = new Octokit({ auth: pan });
const codecommit = new AWS.CodeCommit();

const main = async () => {
  const existingRepos = await codecommit.listRepositories({}).promise()
    .then(resp => resp.repositories!.map(r => r.repositoryName!));
  const tempDir = mkdtempSync(join(tmpdir(), 'git-backup-'));
  console.log(`using temp dir ${tempDir}`);

  for (const org of await octokit.paginate(octokit.orgs.listForAuthenticatedUser)) {
    for (const repo of await octokit.paginate(octokit.repos.listForOrg, { org: org.login })) {
      const targetRepoName = `${org.login}_${repo.name}`;
      if (!existingRepos.includes(targetRepoName)) {
        console.log(`creating codecommit repo ${targetRepoName}`);
        await codecommit.createRepository({repositoryName: targetRepoName}).promise();
      } else {
        console.log(`re-using existing codecommit repo ${targetRepoName}`);
      }
      await simpleGit()
        .clone(`git@github.com:${org.login}/${repo.name}.git`, join(tempDir, `${targetRepoName}`));
      const local = await simpleGit(join(tempDir, `${targetRepoName}`));
      const defaultBranch = await local.branchLocal().then(l => l.current);
      local.addRemote('codecommit', `ssh://git-codecommit.ap-southeast-2.amazonaws.com/v1/repos/${targetRepoName}`)
        .push(['-u', 'codecommit', defaultBranch]);
    }
  }
}

main();
