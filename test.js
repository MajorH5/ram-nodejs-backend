const {
	RegExpMatcher,
	TextCensor,
	englishDataset,
	englishRecommendedTransformers,
} = require('obscenity');
const matcher = new RegExpMatcher({
	...englishDataset.build(),
	...englishRecommendedTransformers,
});
if (matcher.hasMatch('f0ck you')) {
	console.log('The input text contains profanities.');
}
// The input text contains profanities.