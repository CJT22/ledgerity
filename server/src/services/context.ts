import { ISODate } from '../../../shared/types';
import { AppConfig } from '../config';
import { Db } from '../db/connection';
import { Models } from '../models';

export interface ServiceContext {
  db: Db;
  models: Models;
  config: AppConfig;
  /** Local "today" (injectable for tests). */
  today: () => ISODate;
}
