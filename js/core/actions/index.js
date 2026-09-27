// すべてのアクションをまとめ、プロジェクト用のストアを作る
import { createStore } from '../store.js';
import { makeContext } from './context.js';
import { projectReducers } from './project.js';
import { operatorReducers } from './operators.js';
import { stationReducers } from './stations.js';
import { lineReducers } from './lines.js';
import { interchangeReducers } from './interchanges.js';

export const reducers = {
  ...projectReducers,
  ...operatorReducers,
  ...stationReducers,
  ...lineReducers,
  ...interchangeReducers,
};

/**
 * @param {import('../schema.js').Project} project
 * @param {{ now?: () => string, maxHistory?: number }} [opt]
 */
export function createProjectStore(project, opt = {}) {
  return createStore(project, { reducers, makeContext, ...opt });
}

export { makeContext };
