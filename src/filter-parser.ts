import { FilterGroup } from "./types";

export interface FilterExtraction {
	preFill: Record<string, string>;
	locationFromFilter: string | null;
}

export function extractFromFilters(filters?: FilterGroup): FilterExtraction {
	const preFill: Record<string, string> = {};
	let locationFromFilter: string | null = null;

	if (!filters?.and) return { preFill, locationFromFilter };

	for (const expr of filters.and) {
		if (typeof expr !== "string") continue;

		// file.folder == "value" -> location hint, not a note property
		const folderMatch = expr.match(/^file\.folder\s*==\s*"([^"]*)"$/);
		if (folderMatch) {
			locationFromFilter = folderMatch[1];
			continue;
		}

		// property == "value"
		const stringMatch = expr.match(/^([\w][\w.-]*)\s*==\s*"([^"]*)"$/);
		if (stringMatch && !stringMatch[1].startsWith("file.")) {
			const prop = stripNotePrefix(stringMatch[1]);
			preFill[prop] = stringMatch[2];
			continue;
		}

		// property == link("value")
		const linkMatch = expr.match(
			/^([\w][\w.-]*)\s*==\s*link\("([^"]*)"\)$/
		);
		if (linkMatch && !linkMatch[1].startsWith("file.")) {
			const prop = stripNotePrefix(linkMatch[1]);
			preFill[prop] = `[[${linkMatch[2]}]]`;
			continue;
		}
	}

	return { preFill, locationFromFilter };
}

function stripNotePrefix(property: string): string {
	return property.startsWith("note.") ? property.slice(5) : property;
}

export function mergeExtractions(
	base: FilterExtraction,
	view: FilterExtraction
): FilterExtraction {
	return {
		preFill: { ...base.preFill, ...view.preFill },
		locationFromFilter:
			view.locationFromFilter ?? base.locationFromFilter,
	};
}
