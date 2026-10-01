// Shared text for the global mechanics. Chapters own their own text.

export const WHERE = [
  { text: 'Water is inside a cloud above the Pacific.', note: 'A big cumulus cloud can weigh more than a hundred elephants. It floats because it is spread out over a huge space.' },
  { text: 'Water is frozen inside a glacier in Greenland.', note: 'Some of that ice fell as snow before the pyramids were built.' },
  { text: 'Water is moving through the soil beneath a forest.', note: 'It creeps between grains of sand and clay, sometimes only a few centimeters a day.' },
  { text: 'Water is inside a blueberry.', note: 'A blueberry is about 85% water. So are you, roughly, when you were born.' },
  { text: 'Water is moving through your body right now.', note: 'Your blood is mostly water. It carries oxygen, food, and messages.' },
  { text: 'Water is falling from the sky in Japan.', note: 'Somewhere on Earth it is always raining.' },
  { text: 'Water is rising as vapor off a hot road after a storm.', note: 'That shimmer is evaporation you can actually see.' },
  { text: 'Water is climbing the trunk of a redwood tree.', note: 'It rises over a hundred meters without a pump. Ask the tree chapter how.' },
  { text: 'Water is locked in permafrost in Siberia.', note: 'Ground that has stayed frozen for thousands of years.' },
  { text: 'Water is sitting in a puddle a dog is about to drink.', note: 'Good dog.' },
  { text: 'Water is three kilometers down, in the dark, near a hydrothermal vent.', note: 'Hot enough to cook, but the pressure keeps it liquid.' },
  { text: 'Water is in the steam above a cup of tea in Nairobi.', note: 'It will be back in a cloud by tonight.' },
  { text: 'Water is inside a comet, far past Neptune.', note: 'Some of Earth\'s water may have arrived that way.' },
  { text: 'Water is hiding in the walls of a canyon, slowly widening a crack.', note: 'Freeze, expand, thaw, repeat. This is how water breaks rock.' },
  { text: 'Water is in the mist of a waterfall, catching a rainbow.', note: 'Every droplet is a tiny prism.' },
  { text: 'Water is in a reservoir, waiting to become someone\'s morning shower.', note: 'From here it goes to a treatment plant, then through pipes under the street.' },
  { text: 'Water is in the sap of a maple tree, moving up as spring arrives.', note: 'Tap it and you get syrup.' },
  { text: 'Water is inside an ancient aquifer under the Sahara.', note: 'It fell as rain when the desert was green, ten thousand years ago.' },
  { text: 'Water is in your breath.', note: 'Exhale onto a cold window. That fog is you.' },
  { text: 'Water is in the ocean, one wave from the shore.', note: 'The water in a wave barely moves forward. The energy does.' },
];

// FOLLOW THE WATER is a graph. You are the water. `chapter` scrolls the page to that section; `form` is how the drop looks.
// A node with `next` goes on by itself; a node with `choices` waits for the visitor; a node with neither is the end (the finale).
// `discover` names the idea only after the visitor has lived it.
export const FOLLOW = [
  { id: 'snow', word: 'Snow', text: 'You are a snowflake. You fall. You land on the peak.', chapter: 'mountain', form: 'snow', next: 'melt' },
  { id: 'melt', word: 'Melt', text: 'Spring sun. You melt.', chapter: 'mountain', form: 'drop', next: 'slide' },
  { id: 'slide', word: 'Slide', text: 'You slide down the mountain, faster than you thought.', chapter: 'mountain', form: 'drop', next: 'stream' },
  { id: 'stream', word: 'Stream', text: 'You find other drops. You join a stream. You accelerate.', chapter: 'mountain', form: 'drop', next: 'split' },
  { id: 'split', word: 'Rock', text: 'You hit a rock. You split. One part goes left. One part goes right.', chapter: 'mountain', form: 'drop',
    choices: [
      { label: 'Follow the left', next: 'pond', consequence: 'You slow. The water gathers around you.' },
      { label: 'Follow the right', next: 'river', consequence: 'You speed up. The slope is steep.' },
    ] },
  // left: the pond that waits, then the reservoir and the tap
  { id: 'pond', word: 'Pond', text: 'A pond that waits. You rest, and the sky rests on you.', chapter: 'mountain', form: 'drop', next: 'reservoir' },
  { id: 'reservoir', word: 'Reservoir', text: 'A dam holds you for months. Then filters, a little chlorine, and pipes under the street.', chapter: 'cup', form: 'drop', next: 'glass' },
  { id: 'glass', word: 'Glass', text: 'You come out of a faucet. You are in a cup.', chapter: 'cup', form: 'drop',
    choices: [
      { label: 'Be drunk', next: 'you', consequence: 'A hand lifts the cup.' },
      { label: 'Let it run', next: 'drain', consequence: 'The cup tips. You spill.' },
      { label: 'Be frozen', next: 'ice', consequence: 'The air turns cold around you.' },
    ] },
  { id: 'you', word: 'You', text: 'You are inside a person. Blood, brain, fingers, knees.', chapter: 'you', form: 'drop', next: 'breath' },
  { id: 'breath', word: 'Breath', text: 'Someone exhales. You leave as a breath, warm and invisible.', chapter: 'you', form: 'vapor', next: 'cloud' },
  { id: 'ice', word: 'Ice', text: 'You lock into a crystal. Nothing moves. Then it warms.', chapter: 'lab', form: 'ice', next: 'drain' },
  { id: 'drain', word: 'Drain', text: 'Sink, street, gutter. You go down.', chapter: 'soil', form: 'drop', next: 'river' },
  // right: the river that accelerates
  { id: 'river', word: 'River', text: 'Streams merge. The river carries you, and a little mountain with it.', chapter: 'mountain', form: 'drop', next: 'sea' },
  { id: 'sea', word: 'Ocean', text: 'You reach the sea, and drift for years.', chapter: 'ocean', form: 'drop', next: 'evaporate' },
  { id: 'evaporate', word: 'Evaporation', text: 'Sun warms the surface. You lift off.', chapter: 'ocean', form: 'vapor', next: 'rise',
    discover: { term: 'evaporation', line: 'You just left the ocean without a boat.' } },
  { id: 'rise', word: 'Rise', text: 'You are a loose haze, drifting up with the warm air.', chapter: 'grove', form: 'vapor', next: 'cloud' },
  { id: 'cloud', word: 'Cloud', text: 'High up you cool. You cling to a speck of dust with a billion others.', chapter: 'grove', form: 'vapor', next: 'rain' },
  { id: 'rain', word: 'Rain', text: 'You are heavy now. You fall.', chapter: 'rain', form: 'rain', next: 'ground' },
  { id: 'ground', word: 'Ground', text: 'You land on the ground. What is under you?', chapter: 'soil', form: 'drop',
    choices: [
      { label: 'Rock', next: 'runoff', consequence: 'Nowhere to go but along.' },
      { label: 'Sand', next: 'sink', consequence: 'The grains are wide apart.' },
      { label: 'Clay', next: 'sit', consequence: 'The grains are packed close.' },
    ] },
  // rock: fast runoff
  { id: 'runoff', word: 'Runoff', text: 'You cannot get in. You run off across the surface, fast.', chapter: 'soil', form: 'drop', next: 'gully',
    discover: { term: 'permeability', line: 'You just discovered permeability.' } },
  { id: 'gully', word: 'Gully', text: 'You pour into a gully and race for the river, then the cold high air lifts you.', chapter: 'mountain', form: 'drop', next: 'again' },
  // sand: quick sink to groundwater, back at a spring
  { id: 'sink', word: 'Sink', text: 'You sink at once, between the grains.', chapter: 'soil', form: 'drop', next: 'aquifer',
    discover: { term: 'permeability', line: 'You just discovered permeability.' } },
  { id: 'aquifer', word: 'Groundwater', text: 'You join the dark water under everything. You wait for years.', chapter: 'soil', form: 'drop', next: 'spring' },
  { id: 'spring', word: 'Spring', text: 'Pressure pushes you up. You bubble out of a hillside, cold and clear.', chapter: 'mountain', form: 'drop', next: 'again' },
  // clay: sits, some evaporates, some seeps slowly to a root
  { id: 'sit', word: 'Clay', text: 'You sit on top. Some of you lifts into the air. The rest waits.', chapter: 'soil', form: 'drop', next: 'seep',
    discover: { term: 'permeability', line: 'You just discovered permeability.' } },
  { id: 'seep', word: 'Seep', text: 'Slowly, slowly, you creep down between the grains.', chapter: 'soil', form: 'drop', next: 'root' },
  { id: 'root', word: 'Root', text: 'A root finds you. It pulls you in.', chapter: 'grove', form: 'drop', next: 'leaf' },
  { id: 'leaf', word: 'Leaf', text: 'Up the trunk, out through a leaf, into the air.', chapter: 'grove', form: 'vapor', next: 'again',
    discover: { term: 'transpiration', line: 'You just left through a leaf.' } },
  // the loop closes
  { id: 'again', word: 'Snow', text: 'Cold on a mountain peak. You are a snowflake. You fall.', chapter: 'mountain', form: 'snow',
    discover: { term: 'the water cycle', line: 'You just went all the way around.' } },
];
