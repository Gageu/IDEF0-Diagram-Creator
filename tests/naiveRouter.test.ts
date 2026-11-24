import { describe } from 'vitest';
import { createNaiveRouter, referenceLayoutOptions } from '../src/layout';
import { describeRouterContract } from './routerContract';

describe('naive router meets the Router contract', () => {
  describeRouterContract(() => createNaiveRouter(referenceLayoutOptions.routing));
});
