export interface NewNoteSettings {
	template?: string;
	location?: string;
}

export interface FilterGroup {
	and?: FilterExpression[];
	or?: FilterExpression[];
	not?: FilterExpression[];
}

export type FilterExpression = string | FilterGroup;

export interface ViewConfig {
	type: string;
	name: string;
	filters?: FilterGroup;
	newNoteSettings?: NewNoteSettings;
	groupBy?: unknown;
	order?: string[];
	sort?: unknown[];
	columnSize?: Record<string, number>;
}

export interface BaseFileConfig {
	filters?: FilterGroup;
	newNoteSettings?: NewNoteSettings;
	views?: ViewConfig[];
	properties?: Record<string, unknown>;
}

export interface ActiveBaseContext {
	baseFilePath: string;
	baseConfig: BaseFileConfig;
	activeViewName: string | null;
	activeViewConfig: ViewConfig | null;
}

export interface ResolvedNoteConfig {
	template: string | null;
	location: string | null;
	preFilledProperties: Record<string, string>;
}
