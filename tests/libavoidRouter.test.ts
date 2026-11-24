import { describe } from 'vitest';
import { loadRouter } from '../src/app/composition';
import { describeRouterContract } from './routerContract';

const router = await loadRouter();

describe('libavoid router meets the Router contract', () => {
  describeRouterContract(() => router);
});
