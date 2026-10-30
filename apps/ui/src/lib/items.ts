export type Facing = 'north' | 'south' | 'east' | 'west';

export type Item = {
	name: string;
	url: string;
	price?: number;
	// Real-world size in inches; width runs side to side as seen from the front.
	size: { width: number; height: number; depth: number };
	// Plan pixel coordinates (see floorplan.ts) of the item's footprint center.
	at: [x: number, y: number];
	elevationIn?: number;
	facing: Facing;
	color: number;
	screen?: boolean;
};

export const items: Item[] = [
	{
		name: 'Samsung 85" M70HB Mini LED TV',
		url: 'https://www.walmart.com/ip/18182363041',
		price: 997.99,
		// Walmart lists height and depth but no width; 74.6" is the 85" 16:9 panel plus bezel.
		size: { width: 74.6, height: 42.7, depth: 3 },
		at: [570, 765],
		elevationIn: 30,
		facing: 'west',
		color: 0x1a1a1a,
		screen: true,
	},
];
