const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    houseNumber: { type: String, required: true },
    locality: { type: String, required: true },
    city: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, enum: ["AFGHANISTAN", "ALBANIA", "ALGERIA", "ANDORRA", "ANGOLA", "ANTIGUA AND BARBUDA", "ARGENTINA", "ARMENIA", "AUSTRALIA", "AUSTRIA", "AZERBAIJAN", "BAHAMAS", "BAHRAIN", "BANGLADESH", "BARBADOS", "BELARUS", "BELGIUM", "BELIZE", "BENIN", "BHUTAN", "BOLIVIA", "BOSNIA AND HERZEGOVINA", "BOTSWANA", "BRAZIL", "BRUNEI", "BULGARIA", "BURKINA FASO", "BURUNDI", "CABO VERDE", "CAMBODIA", "CAMEROON", "CANADA", "CENTRAL AFRICAN REPUBLIC", "CHAD", "CHILE", "CHINA", "COLOMBIA", "COMOROS", "CONGO, DEMOCRATIC REPUBLIC OF THE", "CONGO, REPUBLIC OF THE", "COSTA RICA", "CÔTE D'IVOIRE", "CROATIA", "CUBA", "CYPRUS", "CZECH REPUBLIC", "DENMARK", "DJIBOUTI", "DOMINICA", "DOMINICAN REPUBLIC", "ECUADOR", "EGYPT", "EL SALVADOR", "EQUATORIAL GUINEA", "ERITREA", "ESTONIA", "ESWATINI", "ETHIOPIA", "FIJI", "FINLAND", "FRANCE", "GABON", "GAMBIA", "GEORGIA", "GERMANY", "GHANA", "GREECE", "GRENADA", "GUATEMALA", "GUINEA", "GUINEA-BISSAU", "GUYANA", "HAITI", "HONDURAS", "HUNGARY", "ICELAND", "INDIA", "INDONESIA", "IRAN", "IRAQ", "IRELAND", "ISRAEL", "ITALY", "JAMAICA", "JAPAN", "JORDAN", "KAZAKHSTAN", "KENYA", "KIRIBATI", "KOREA, NORTH", "KOREA, SOUTH", "KOSOVO", "KUWAIT", "KYRGYZSTAN", "LAOS", "LATVIA", "LEBANON", "LESOTHO", "LIBERIA", "LIBYA", "LIECHTENSTEIN", "LITHUANIA", "LUXEMBOURG", "MADAGASCAR", "MALAWI", "MALAYSIA", "MALDIVES", "MALI", "MALTA", "MARSHALL ISLANDS", "MAURITANIA", "MAURITIUS", "MEXICO", "MICRONESIA", "MOLDOVA", "MONACO", "MONGOLIA", "MONTENEGRO", "MOROCCO", "MOZAMBIQUE", "MYANMAR", "NAMIBIA", "NAURU", "NEPAL", "NETHERLANDS", "NEW ZEALAND", "NICARAGUA", "NIGER", "NIGERIA", "NORTH MACEDONIA", "NORWAY", "OMAN", "PAKISTAN", "PALAU", "PALESTINE", "PANAMA", "PAPUA NEW GUINEA", "PARAGUAY", "PERU", "PHILIPPINES", "POLAND", "PORTUGAL", "QATAR", "ROMANIA", "RUSSIA", "RWANDA", "SAINT KITTS AND NEVIS", "SAINT LUCIA", "SAINT VINCENT AND THE GRENADINES", "SAMOA", "SAN MARINO", "SÃO TOMÉ AND PRÍNCIPE", "SAUDI ARABIA", "SENEGAL", "SERBIA", "SEYCHELLES", "SIERRA LEONE", "SINGAPORE", "SLOVAKIA", "SLOVENIA", "SOLOMON ISLANDS", "SOMALIA", "SOUTH AFRICA", "SOUTH SUDAN", "SPAIN", "SRI LANKA", "SUDAN", "SURINAME", "SWEDEN", "SWITZERLAND", "SYRIA", "TAIWAN", "TAJIKISTAN", "TANZANIA", "THAILAND", "TIMOR-LESTE", "TOGO", "TONGA", "TRINIDAD AND TOBAGO", "TUNISIA", "TURKEY", "TURKMENISTAN", "TUVALU", "UGANDA", "UKRAINE", "UNITED ARAB EMIRATES", "UNITED KINGDOM", "UNITED STATES", "URUGUAY", "UZBEKISTAN", "VANUATU", "VATICAN CITY", "VENEZUELA", "VIETNAM", "YEMEN", "ZAMBIA", "ZIMBABWE"], required: true },
    zipcode: { type: String, required: true },
    landmark: { type: String, required: false },
    createdDate: { type: Date, default: Date.now },
    addressType: { type: String, enum: ['HOME', 'OFFICE', 'OTHER'], required: true },
    otherAddressType: { type: String, required: function () { return this.address_type === 'OTHER'; } },
    name: { type: String, required: true }
});

module.exports = mongoose.model('Address', addressSchema);