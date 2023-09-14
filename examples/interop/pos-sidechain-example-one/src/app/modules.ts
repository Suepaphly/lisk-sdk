/* eslint-disable @typescript-eslint/no-empty-function */
import { Application } from 'lisk-sdk';
import { HelloModule } from './modules/hello/module';

export const registerModules = (app: Application): void => {
	app.registerInteroperableModule(new HelloModule());
	app.registerModule(new HelloModule());
};
