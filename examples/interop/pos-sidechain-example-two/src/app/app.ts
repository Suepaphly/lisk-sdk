import { Application, PartialApplicationConfig } from 'lisk-sdk';
import { registerModules } from './modules';
import { registerPlugins } from './plugins';
import { ReactModule } from './modules/react/module';

export const getApplication = (config: PartialApplicationConfig): Application => {
	const { app, method } = Application.defaultApplication(config, true);

	const reactModule = new ReactModule();
	app.registerModule(reactModule);
	reactModule.addDependencies(method.interoperability);
	const interoperabilityModule = app['_registeredModules'].find(
		mod => mod.name === 'interoperability',
	);
	interoperabilityModule.registerInteroperableModule(reactModule);

	registerModules(app);
	registerPlugins(app);

	return app;
};
