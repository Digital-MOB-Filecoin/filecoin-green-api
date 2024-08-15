const v102PerGiB = {
  "min":{
    "sealing_kWh_GiB_base":0.00843961073,
    "sealing_kWh_GiB_base_*_120":1.0127532876,
    "sealing_kWh_GiB_base_/_24":0.00035165044,
    "storage_kW_GiB":0.00000055941949,
    "pue":1.2
  },
  "estimate":{
    "sealing_kWh_GiB_base":0.02330019758,
    "sealing_kWh_GiB_base_*_120":2.7960237096,
    "sealing_kWh_GiB_base_/_24":0.00097084156,
    "storage_kW_GiB":0.00000446676,
    "pue":1.426
  },
  "max":{
    "sealing_kWh_GiB_base":0.12348030976,
    "sealing_kWh_GiB_base_*_120":14.8176371712,
    "sealing_kWh_GiB_base_/_24":0.0051450129,
    "storage_kW_GiB":0.00001073741,
    "pue":1.79
  }
}

module.exports = {
  v102PerGiB
}
