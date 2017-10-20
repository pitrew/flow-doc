var p = require('flow-parser');

var fs = require('fs');
var path = require('path');

const allData = {};
const flatTypes = {};
const typesStack = [];
let level = 0;

const graphData = [];
const graphConnectionsTmp = {};

const tplLayout = data => `
	<html>
		<head>
		<link rel="stylesheet" type="text/css" href="assets/vis.min.css">
		<link rel="stylesheet" type="text/css" href="assets/style.css?${new Date().getTime()}">
		</head>
		<body>
			<div id="typesGraph"></div>	
			${data}
			<script type="text/javascript" src="assets/vis.min.js"></script>
			<script type="text/javascript">
			const graphData = ${JSON.stringify(graphData)};
			const graphConnections = ${JSON.stringify(convertGraphConnectionsToList())}
			</script>
			<script type="text/javascript" src="assets/docs.js"></script>
		</body>
	</html>
`;

const tplLiteralValue = value => `"${value}"`;
const tplSimpleValue = value => `<a href="#${value}">${value}</a>`;
const tplGenericValue = (value, genValue) => `${value}&lt;${genValue}&gt;`;
const tplListSingleValue = value => `<li>${value}</li>`;
const tplListKeyValue = (key, value) => `<li><b>${key}</b>: ${value}</li>`;
const tplTypeShort = (name, value) => `<div><h3><a name="${name}">${name}</a> = ${value}</h3></div>`;
const tplTypeComplex = (name, value) => `
		<div>
			<h3><a name="${name}">${name}</a></h3>
			<ul>
				${value}
			</ul>
		</div>
	`;
const tplError = name => `<p>Error: Type ${name} not found</p>`;

/**
 * Build value
 */
const buildPropValueHTML = (name, value) => {
	let type = '';
	if (!value['__key']) {
		if (value.hasOwnProperty('literal')) {
			type = tplLiteralValue(value.literal);
		} else if (typeof value === 'object') {
			type = `<ul>${buildPropertyHTML(name, value)}</ul>`;
		} else if (flatTypes[value]) {
			type = tplSimpleValue(value);
		} else {
			type = value;
		}
	} else if (value['__value'] === null) {	
		typesStack.push(value['__key']);
		addGraphConnection(name, value['__key']);
		type = tplSimpleValue(value['__key']);
	} else {
		type = tplGenericValue(value['__key'], value['__value'].map(el => buildPropValueHTML(name, el)));
	}
	return type;
};

const buildPropertyHTML = (name, v) => {
	if (v.hasOwnProperty('length')) {
		return v.map(key => tplListSingleValue(buildPropValueHTML(name, key))).join('');	
	}
	return Object.keys(v).map(key => tplListKeyValue(key, buildPropValueHTML(name, v[key]))).join('');
};

const buildTypeHTML = (name, type) => {
	if (type.v['__g']) {
		return tplTypeShort(name, buildPropValueHTML(name, type.v));
	}
	return tplTypeComplex(name, buildPropertyHTML(name, type.v));;
};

const addGraphConnection = (from, to) => {
	if (!graphConnectionsTmp[from + to]) {
		graphConnectionsTmp[from + to] = {
			from,
			to,
			arrows: 'to',
		};
	}
};

const convertGraphConnectionsToList = () => {
	return Object.keys(graphConnectionsTmp).reduce((acc, key) => {
		acc.push(graphConnectionsTmp[key]);
		return acc;
	}, []);
};

let lastUsedLevel = level;
const addToGraph = (name, type) => {
	graphData.push({
		id: name,
		label: name,
		level,
	});
	lastUsedLevel = level;
};

const buildHTML = (startType) => {
	let resp = '';
	const done = {};
	typesStack.push(startType);
	while (typesStack.length > 0) {
		const currentType = typesStack.shift();
		if (currentType === '__level_up') {
			if (lastUsedLevel === level) {
				level++;
			}
			continue;
		}
		if (!done[currentType]) {
			if (flatTypes[currentType]) {
				addToGraph(currentType, flatTypes[currentType]);
				resp += buildTypeHTML(currentType, flatTypes[currentType]);
				typesStack.push('__level_up');
			} 
			else {
				resp += tplError(currentType);
			}
		}
		done[currentType] = true;
	}
	return resp;
};


// just 1 level
const transformGenericToType = (genericName, v) => {
	const params = v['__value']; //0, 1, 2
	const type = flatTypes[genericName];  //type.t //0, 1, 2

	return fixValue(type.v, gtype => {
		const ind = type.t.indexOf(gtype);
		if (ind !== -1) {
			return fixValue(params[ind]);
		}
		return null;
	});
};

const hasThisGeneric = (name) => {
	return flatTypes[name];
};

const fixValue = (v, repl = null) => {
	if (v.hasOwnProperty('__g')) {
		if (v['__g']) {
			if (hasThisGeneric(v['__key'])) {
				return transformGenericToType(v['__key'], v);
			} else {
				if (v['__value'] !== null) {
					return Object.assign(v, {
						'__value': v['__value'].map((el) => {
							return fixValue(el, repl);
						}),
					});
				} else {
					if (repl && repl(v['__key'])) {
						return repl(v['__key']);
					}
					return v;
				}
			}
		} else {
			if (repl && repl(v['__key'])) {
				return repl(v['__key']);
			}
			return v;
		}
	} else if (typeof v === 'string') {  //simple value
		return v; 
	} else if (v.hasOwnProperty('literal')) {
		return v; 
	} else { //obj value
		if (v.hasOwnProperty('length')) {
			return v.map(key => fixValue(key, repl));
		}
		return Object.keys(v).reduce((acc, key) => {
			acc[key] = fixValue(v[key], repl);
			return acc;
		}, {});
	}
};

const fixGenerics = (flatTypes) => {
	const ret = Object.keys(flatTypes).reduce((acc, key) => {
		const currentType = flatTypes[key];
		if (!currentType.g) {
			const new_v = fixValue(currentType.v);
			currentType.v = new_v;
			acc[key] = currentType;
		}
		else {
			acc[key] = flatTypes[key];	
		}
		return acc;
	}, {});
	return ret;
};

/**
 * Helper to check if pth is local
 */
const isLocalPath = (filePath) => {
	return filePath.startsWith('./');
};

/**
 * Handle key
 */
const handleKey = (keyObj) => {
	if (keyObj.type === 'Identifier') {
		return keyObj.name;
	} else if (keyObj.type === 'Literal') {
		return keyObj.value;
	}
	return null;
};

/**
 * Handle value recursively
 */
const handleValue = (value) => {
	if (!value) return null;

	switch(value.type) {
		case 'StringTypeAnnotation':
			return 'string';
		case 'NumberTypeAnnotation':
			return 'number';
		case 'ExistsTypeAnnotation':
			return 'Object';
		case 'GenericTypeAnnotation':
		{
			const pName = value.id.name;
			const pValue = handleValue(value.typeParameters);
			const isGeneric = value.typeParameters !== null;

			return {
				__g: isGeneric,
				__key: pName,
				__value: pValue,
			}
		}
		case 'TypeParameterInstantiation':
			return value.params.map((elem) => {
				return handleValue(elem);
			});
		case 'ObjectTypeProperty':
			return {
				[handleKey(value.key)]: handleValue(value.value),
			};
			break;
		case 'ObjectTypeAnnotation':
			return value.properties.reduce((acc, prop) => {
				return Object.assign(acc, handleValue(prop));
			}, {});
		case 'UnionTypeAnnotation':
			return value.types.map(el => handleValue(el));
		case 'StringLiteralTypeAnnotation':
			return {
				literal: value.value
			};
		case 'TypeParameterDeclaration':
			return 'TypeParameterDeclaration';
		case 'TypeParameter':
			return value.name;
		case 'IntersectionTypeAnnotation':
			return value.types.map(el => handleValue(el));
		default:
			console.log('#### Unknown type:', value.type);
			return {};
	}
	return {};
};

/**
 * Handle type aliases
 */
const handleTypeAlias = (bodyElement, parentFile) => {
	const id = bodyElement.id;
	const right = bodyElement.right;

	const genericTypes = bodyElement.typeParameters && bodyElement.typeParameters.params.map((el, idx) => {
		return handleValue(el);
	});

	allData[parentFile] = allData[parentFile] || {};
	allData[parentFile] = Object.assign(allData[parentFile], {
		[id.name]: {
			g: genericTypes !== null,
			t: genericTypes,
			v: handleValue(right),
		},
	});

	if (flatTypes[id.name]) {
		throw Error('Repeated type:', id.name);
	}
	flatTypes[id.name] = {
		g: genericTypes !== null,
		t: genericTypes,
		v: handleValue(right),
	};
};

/**
 * Handle import declarations
 */
const handleImportDeclaration = (bodyElement, parentFile) => {
	const fileName = bodyElement.source.value;
	
	if (isLocalPath(fileName)) {
		const parentPath = path.dirname(parentFile);
		const absolutePath = path.join(parentPath, fileName);
		const isNew = !allData[absolutePath];

		if (isNew) { // process anly if it's new
			processFile(absolutePath);
		}	
	}
};

/**
 * Handle top level body elements (imports/exports/types)
 */
const handleBodyElement = (bodyElement, fileName) => {
	switch (bodyElement.type) {
		case 'ImportDeclaration':
			handleImportDeclaration(bodyElement, fileName);
			break;
		case 'ExportNamedDeclaration':
			if (bodyElement.declaration) {
				handleBodyElement(bodyElement.declaration, fileName);
			}
			break;
		case 'TypeAlias':
			handleTypeAlias(bodyElement, fileName);
			break;
		default:
			break;
	}
};

let savedSuffix = 'js';

/**
 * Process new file
 */
const processFile = (fileName) => {
	const inputText = fs.readFileSync(`${fileName}.${savedSuffix}`);
	const parsedFile = p.parse(inputText.toString(), {});

	for (let i = 0; i < parsedFile.body.length; i++) {
		const bodyElement = parsedFile.body[i];
		handleBodyElement(bodyElement, fileName);
	}
};

const genFlowDoc = (srcFile, startType, suffix) => {
	savedSuffix = suffix;
	processFile(srcFile);
	const fixed = fixGenerics(flatTypes);
	const html = buildHTML(startType);
	return tplLayout(html);
};
module.exports.default = genFlowDoc;




