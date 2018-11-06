const loki = require('lokijs');
const Configstore = require('configstore');
const pkg = require('./package.json');
const conf = new Configstore(pkg.name);

var db = new loki('sandbox', {
  adapter: {
    mode:"reference",
    saveDatabase: function(dbname, dbstring, callback) {
      // store the database, for this example to localstorage
      console.log(dbstring);
      conf.set('db', dbstring);

      var success = true;  // make your own determinations
      if (success) {
        callback(null);
      }
      else {
        callback(new Error("An error was encountered loading " + dbname + " database."));
      }
    },
    loadDatabase: function(dbname, callback) {
      // using dbname, load the database from wherever your adapter expects it


      var success = true; // make your own determinations

      if (success) {
        callback(conf.get('db'));
      }
      else {
        callback(new Error("There was a problem loading the database"));
      }
    }
  }
});


if (conf.has('db')) {
  console.log("DB EXISTS");
  db.loadDatabase();
  var items = db.addCollection('items');
  console.log(items.data);
} else {
  console.log("DB DOES NOT EXIST");
  // Add a collection to the database
  var items = db.addCollection('items');

  // Add some documents to the collection
  items.insert({ name : 'mjolnir', owner: 'thor', maker: 'dwarves' });
  items.insert({ name : 'gungnir', owner: 'odin', maker: 'elves' });
  items.insert({ name : 'tyrfing', owner: 'Svafrlami', maker: 'dwarves' });
  items.insert({ name : 'draupnir', owner: 'odin', maker: 'elves' });
  items.chain().find({ 'owner': 'odin' }).remove();
  console.log(items.data);
  db.saveDatabase();
}
