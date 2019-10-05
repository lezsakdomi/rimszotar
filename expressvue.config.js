const fs = require('fs');

module.exports = {
    rootPath: __dirname + '/vue',
    pagesPath: __dirname + '/vue/pages',
    head: {
        title: fs.readFileSync('.idea/.name', 'utf8'),
    },
};