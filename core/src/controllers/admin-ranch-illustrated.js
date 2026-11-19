const { MCAnimalConfig, MCItemInfo } = require('../gameConfig/RanchConfig.json');
const itemIcons = require('../gameConfig/RanchItemIcons.json');

// MCAnimalMutation records for the giant book (liyangpengs/qq-farm-bot PR #158).
// Giant item assets alone are not proof of eligibility: chicken has assets but no mutation record.
const giantProductsByAnimal = new Map([
    [60002, 2065002], [60003, 2065003], [60004, 2065004], [60005, 2065005],
    [60006, 2065006], [60007, 2065007], [60008, 2065008], [60009, 2065009],
    [60010, 2065010], [60011, 2065011], [60012, 2065012], [60013, 2065013],
    [60014, 2065014], [60015, 2065015], [60016, 2065016],
    [70001, 2075001], [70002, 2075002], [70003, 2075003], [70004, 2075004],
    [70005, 2075005], [70006, 2075006], [70007, 2075007], [70008, 2075008],
    [70009, 2075009], [70010, 2075010], [70011, 2075011], [70012, 2075012],
]);
const names = new Map(MCItemInfo.map(({ id, name }) => [id, name]));
const giantItems = new Map();
for (const animal of MCAnimalConfig) {
    const id = giantProductsByAnimal.get(animal.id);
    if (id == null || animal.product_item?.id == null) continue;
    giantItems.set(String(animal.product_item.id), {
        id,
        name: names.get(id) || `巨大${animal.name}`,
        image: itemIcons[id] && itemIcons[id] !== itemIcons[animal.product_item.id] ? itemIcons[id] : '',
    });
}

function describeRanchIllustrated(book) {
    if (!Array.isArray(book?.list)) return book;
    return {
        ...book,
        list: book.list.map(entry => {
            const giantItem = giantItems.get(String(entry.fruitId));
            return {
                ...entry,
                giantItem: giantItem ? { ...giantItem, image: giantItem.image === entry.image ? '' : giantItem.image } : null,
            };
        }),
    };
}

module.exports = { describeRanchIllustrated };
