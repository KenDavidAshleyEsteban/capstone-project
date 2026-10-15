const Event = require('../models/Event');
const samples = require('../data/sampleEvents.json');

module.exports = async () => {
  await Event.init();
  if (await Event.exists({})) return;
  try {
    await Event.bulkWrite(samples.map((event) => ({ updateOne: { filter: { id: event.id }, update: { $setOnInsert: event }, upsert: true } })), { ordered: false });
  } catch (error) {
    if (!error.writeErrors?.length || !error.writeErrors.every((entry) => entry.code === 11000)) throw error;
  }
};
