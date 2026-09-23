window.TRIP_DEMOS = [
  {
    id: "demo-shikoku-2026",
    label: "示範資料",
    data: {
      schemaVersion: 3,
      trip: {
        title: "四國自駕 4 日｜高知・松山・百名城",
        startDate: "2026-09-25",
        endDate: "2026-09-28",
        description: "CI278／CI179；OMO7 高知一晚、ダイワロイネットホテル松山兩晚。南国SA找玩偶，並收集高知城、岡豊城、大洲城、松山城、湯築城、今治城。"
      },
      stops: [
        { id:"d01",date:"2026-09-25",startTime:"06:55",endTime:"10:30",title:"CI278｜桃園→高松",category:"移動",transportMode:"飛機",origin:"桃園國際機場 TPE",originLat:25.0797,originLng:121.2342,destination:"高松空港 TAK",address:"高松空港",lat:34.2142,lng:134.0156,cost:"",notes:"抵達後辦理入境與取車。" },
        { id:"d02",date:"2026-09-25",startTime:"10:30",endTime:"11:40",title:"入境・取車・補給",category:"休憩",transportMode:"",origin:"",destination:"",address:"高松空港",lat:34.2142,lng:134.0156,cost:"",notes:"取車後先確認南国SA下行玩偶庫存。" },
        { id:"d03",date:"2026-09-25",startTime:"11:40",endTime:"12:45",title:"自駕｜高松空港→豊浜SA",category:"移動",transportMode:"自駕",origin:"高松空港",destination:"豊浜SA 下り",address:"豊浜サービスエリア 下り",lat:34.0347,lng:133.6418,cost:"高速公路費另計",notes:"走高松西IC、E11；避免在高松市區停留。" },
        { id:"d04",date:"2026-09-25",startTime:"12:45",endTime:"13:05",title:"豊浜SA 短休",category:"休憩",transportMode:"",origin:"",destination:"",address:"豊浜サービスエリア 下り",lat:34.0347,lng:133.6418,cost:"",notes:"洗手間、飲料與簡單補給，不安排正式午餐。" },
        { id:"d05",date:"2026-09-25",startTime:"13:05",endTime:"14:00",title:"自駕｜豊浜SA→南国SA下行",category:"移動",transportMode:"自駕",origin:"豊浜SA 下り",destination:"南国SA 下り",address:"南国サービスエリア 下り",lat:33.6068,lng:133.6268,cost:"高速公路費另計",notes:"經川之江JCT進入高知道。" },
        { id:"d06",date:"2026-09-25",startTime:"14:00",endTime:"14:40",title:"南国SA 午餐・尋找玩偶",category:"食事",transportMode:"",origin:"",destination:"",address:"南国サービスエリア 下り",lat:33.6068,lng:133.6268,cost:"",notes:"先找カワウソうそやん玩偶再用餐；若無貨，須崎列為備援，不再加入桂濱。" },
        { id:"d07",date:"2026-09-25",startTime:"14:40",endTime:"15:00",title:"自駕｜南国SA→岡豊城",category:"移動",transportMode:"自駕",origin:"南国SA 下り",destination:"高知県立歴史民俗資料館",address:"高知県立歴史民俗資料館",lat:33.5946,lng:133.6224,cost:"",notes:"玩偶成功購得時採此主線；未購得則改往須崎。" },
        { id:"d08",date:"2026-09-25",startTime:"15:00",endTime:"16:20",title:"岡豊城・歷史民俗資料館",category:"觀光",transportMode:"",origin:"",destination:"",address:"高知県立歴史民俗資料館",lat:33.5946,lng:133.6224,cost:"",notes:"續日本100名城 No.180；先蓋章，再依雨勢走主要曲輪。" },
        { id:"d09",date:"2026-09-25",startTime:"16:20",endTime:"17:00",title:"自駕｜岡豊城→OMO7 高知",category:"移動",transportMode:"自駕",origin:"高知県立歴史民俗資料館",destination:"OMO7 高知",address:"OMO7 高知 by 星野リゾート",lat:33.5579,lng:133.5488,cost:"",notes:"抵達後先停車、辦理入住與放行李。" },
        { id:"d10",date:"2026-09-25",startTime:"17:30",endTime:"18:00",title:"OMO7→ひろめ市場",category:"移動",transportMode:"市電／計程車",origin:"OMO7 高知",destination:"ひろめ市場",address:"ひろめ市場",lat:33.5607,lng:133.5310,cost:"",notes:"飯店距菜園場町站步行約5分鐘。" },
        { id:"d11",date:"2026-09-25",startTime:"18:00",endTime:"19:30",title:"ひろめ市場晚餐",category:"食事",transportMode:"",origin:"",destination:"",address:"ひろめ市場",lat:33.5607,lng:133.5310,cost:"",notes:"鰹魚半敲燒、土佐卷或土佐赤牛。" },
        { id:"d12",date:"2026-09-25",startTime:"20:00",endTime:"",title:"OMO7 高知",category:"休憩",transportMode:"",origin:"",destination:"",address:"OMO7 高知 by 星野リゾート",lat:33.5579,lng:133.5488,cost:"",notes:"第一晚住宿。" },

        { id:"d13",date:"2026-09-26",startTime:"08:30",endTime:"09:00",title:"自駕｜OMO7→高知城停車場",category:"移動",transportMode:"自駕",origin:"OMO7 高知",destination:"高知城",address:"高知城",lat:33.5613,lng:133.5311,cost:"停車費另計",notes:"週六市中心車流增加，09:00前抵達。" },
        { id:"d14",date:"2026-09-26",startTime:"09:00",endTime:"10:40",title:"高知城",category:"觀光",transportMode:"",origin:"",destination:"",address:"高知城",lat:33.5613,lng:133.5311,cost:"",notes:"日本100名城 No.84；雨天石階慢行。" },
        { id:"d15",date:"2026-09-26",startTime:"10:40",endTime:"11:40",title:"帶屋町・播磨屋橋散步",category:"觀光",transportMode:"步行",origin:"高知城",destination:"帯屋町商店街",address:"帯屋町商店街",lat:33.5596,lng:133.5370,cost:"",notes:"咖啡與市區購物。" },
        { id:"d16",date:"2026-09-26",startTime:"11:40",endTime:"12:40",title:"高知市區午餐",category:"食事",transportMode:"",origin:"",destination:"",address:"帯屋町商店街",lat:33.5596,lng:133.5370,cost:"",notes:"若前晚已吃ひろめ市場，改吃土佐料理或鍋燒拉麵。" },
        { id:"d17",date:"2026-09-26",startTime:"12:40",endTime:"13:20",title:"自駕｜高知市區→桂濱",category:"移動",transportMode:"自駕",origin:"高知市區",destination:"桂浜",address:"桂浜",lat:33.4975,lng:133.5725,cost:"停車費另計",notes:"若大雨則取消，改室內景點並提早往松山。" },
        { id:"d18",date:"2026-09-26",startTime:"13:20",endTime:"14:10",title:"桂濱・坂本龍馬像",category:"觀光",transportMode:"",origin:"",destination:"",address:"桂浜",lat:33.4975,lng:133.5725,cost:"",notes:"第一天已完成岡豊城時採用。" },
        { id:"d19",date:"2026-09-26",startTime:"14:10",endTime:"16:10",title:"自駕｜桂濱→石鎚山SA",category:"移動",transportMode:"自駕",origin:"桂浜",destination:"石鎚山SA 上り",address:"石鎚山サービスエリア 上り",lat:33.8835,lng:133.1188,cost:"高速公路費另計",notes:"高知道→川之江JCT→松山道；雨天降低車速。" },
        { id:"d20",date:"2026-09-26",startTime:"16:10",endTime:"16:25",title:"石鎚山SA 駕駛休息",category:"休憩",transportMode:"",origin:"",destination:"",address:"石鎚山サービスエリア 上り",lat:33.8835,lng:133.1188,cost:"",notes:"洗手間與伸展。" },
        { id:"d21",date:"2026-09-26",startTime:"16:25",endTime:"17:20",title:"自駕｜石鎚山SA→松山飯店",category:"移動",transportMode:"自駕",origin:"石鎚山SA 上り",destination:"ダイワロイネットホテル松山",address:"ダイワロイネットホテル松山",lat:33.8398,lng:132.7715,cost:"停車費另計",notes:"抵達後不再開車，步行逛大街道。" },
        { id:"d22",date:"2026-09-26",startTime:"18:00",endTime:"19:30",title:"大街道・銀天街晚餐",category:"食事",transportMode:"步行",origin:"ダイワロイネットホテル松山",destination:"大街道商店街",address:"大街道商店街",lat:33.8408,lng:132.7695,cost:"",notes:"松山鯛飯或五色素麵。" },
        { id:"d23",date:"2026-09-26",startTime:"20:00",endTime:"",title:"ダイワロイネットホテル松山",category:"休憩",transportMode:"",origin:"",destination:"",address:"ダイワロイネットホテル松山",lat:33.8398,lng:132.7715,cost:"",notes:"連住第一晚。" },

        { id:"d24",date:"2026-09-27",startTime:"07:45",endTime:"09:00",title:"自駕｜松山→大洲城",category:"移動",transportMode:"自駕",origin:"ダイワロイネットホテル松山",destination:"大洲城",address:"大洲城",lat:33.5063,lng:132.5446,cost:"高速公路費另計",notes:"週日上午車流通常偏低。" },
        { id:"d25",date:"2026-09-27",startTime:"09:00",endTime:"10:20",title:"大洲城",category:"觀光",transportMode:"",origin:"",destination:"",address:"大洲城",lat:33.5063,lng:132.5446,cost:"",notes:"日本100名城 No.82。" },
        { id:"d26",date:"2026-09-27",startTime:"10:20",endTime:"11:30",title:"自駕｜大洲城→松山飯店",category:"移動",transportMode:"自駕",origin:"大洲城",destination:"ダイワロイネットホテル松山",address:"ダイワロイネットホテル松山",lat:33.8398,lng:132.7715,cost:"",notes:"回飯店停車；市內改步行與路面電車。" },
        { id:"d27",date:"2026-09-27",startTime:"11:40",endTime:"13:30",title:"松山城",category:"觀光",transportMode:"纜車／吊椅",origin:"ロープウェイ街",destination:"松山城",address:"松山城",lat:33.8456,lng:132.7656,cost:"",notes:"日本100名城 No.81；雨天搭纜車。" },
        { id:"d28",date:"2026-09-27",startTime:"13:30",endTime:"14:30",title:"纜車街午餐",category:"食事",transportMode:"",origin:"",destination:"",address:"ロープウェイ街 松山",lat:33.8430,lng:132.7703,cost:"",notes:"宇和島式鯛魚飯或松山鯛飯。" },
        { id:"d29",date:"2026-09-27",startTime:"14:40",endTime:"15:00",title:"市電｜大街道→道後公園",category:"移動",transportMode:"市電",origin:"大街道駅",destination:"道後公園駅",address:"道後公園駅",lat:33.8488,lng:132.7860,cost:"",notes:"避免週日道後停車壓力。" },
        { id:"d30",date:"2026-09-27",startTime:"15:00",endTime:"16:10",title:"湯築城",category:"觀光",transportMode:"",origin:"",destination:"",address:"湯築城資料館",lat:33.8497,lng:132.7868,cost:"",notes:"日本100名城 No.80；資料館、武家屋敷、土壘。" },
        { id:"d31",date:"2026-09-27",startTime:"16:10",endTime:"16:30",title:"步行｜湯築城→道後溫泉",category:"移動",transportMode:"步行",origin:"湯築城資料館",destination:"道後温泉本館",address:"道後温泉本館",lat:33.8520,lng:132.7864,cost:"",notes:"沿道後商店街移動。" },
        { id:"d32",date:"2026-09-27",startTime:"16:30",endTime:"19:00",title:"道後溫泉・商店街・晚餐",category:"觀光",transportMode:"步行",origin:"",destination:"",address:"道後温泉本館",lat:33.8520,lng:132.7864,cost:"",notes:"本館或飛鳥乃湯泉；晚餐可在商店街解決。" },
        { id:"d33",date:"2026-09-27",startTime:"19:00",endTime:"19:30",title:"市電｜道後溫泉→大街道",category:"移動",transportMode:"市電",origin:"道後温泉駅",destination:"大街道駅",address:"大街道駅",lat:33.8407,lng:132.7704,cost:"",notes:"返回同一間飯店。" },
        { id:"d34",date:"2026-09-27",startTime:"19:30",endTime:"",title:"ダイワロイネットホテル松山",category:"休憩",transportMode:"",origin:"",destination:"",address:"ダイワロイネットホテル松山",lat:33.8398,lng:132.7715,cost:"",notes:"連住第二晚。" },

        { id:"d35",date:"2026-09-28",startTime:"08:00",endTime:"09:15",title:"自駕｜松山→今治城",category:"移動",transportMode:"自駕",origin:"ダイワロイネットホテル松山",destination:"今治城",address:"今治城",lat:34.0662,lng:132.9978,cost:"",notes:"07:45退房，避開松山市區通勤尖峰。" },
        { id:"d36",date:"2026-09-28",startTime:"09:15",endTime:"10:35",title:"今治城",category:"觀光",transportMode:"",origin:"",destination:"",address:"今治城",lat:34.0662,lng:132.9978,cost:"",notes:"日本100名城 No.79。" },
        { id:"d37",date:"2026-09-28",startTime:"10:35",endTime:"11:25",title:"自駕｜今治城→伊予西條",category:"移動",transportMode:"自駕",origin:"今治城",destination:"鉄道歴史パーク in SAIJO",address:"鉄道歴史パーク in SAIJO",lat:33.9132,lng:133.1875,cost:"",notes:"國道196號市區號誌較多。" },
        { id:"d38",date:"2026-09-28",startTime:"11:25",endTime:"12:30",title:"鐵道歷史公園 in SAIJO",category:"觀光",transportMode:"",origin:"",destination:"",address:"鉄道歴史パーク in SAIJO",lat:33.9132,lng:133.1875,cost:"",notes:"室內景點，適合雨天。" },
        { id:"d39",date:"2026-09-28",startTime:"12:30",endTime:"13:30",title:"伊予西條午餐",category:"食事",transportMode:"",origin:"",destination:"",address:"伊予西条駅",lat:33.9129,lng:133.1877,cost:"",notes:"車站周邊用餐。" },
        { id:"d40",date:"2026-09-28",startTime:"13:30",endTime:"14:10",title:"西條站前・物產採買",category:"觀光",transportMode:"步行",origin:"",destination:"",address:"伊予西条駅",lat:33.9129,lng:133.1877,cost:"",notes:"最晚14:10離開，保留機場緩衝。" },
        { id:"d41",date:"2026-09-28",startTime:"14:10",endTime:"15:50",title:"自駕｜西條→高松空港",category:"移動",transportMode:"自駕",origin:"伊予西条駅",destination:"高松空港",address:"高松空港",lat:34.2142,lng:134.0156,cost:"高速公路費另計",notes:"走松山道、高松道；途中非必要不停靠。" },
        { id:"d42",date:"2026-09-28",startTime:"15:50",endTime:"16:20",title:"加油・還車",category:"移動",transportMode:"自駕",origin:"高松空港附近加油站",destination:"高松空港租車櫃檯",address:"高松空港",lat:34.2142,lng:134.0156,cost:"油資另計",notes:"預留還車與接駁時間。" },
        { id:"d43",date:"2026-09-28",startTime:"16:20",endTime:"18:20",title:"機場報到・晚餐・購物",category:"食事",transportMode:"",origin:"",destination:"",address:"高松空港",lat:34.2142,lng:134.0156,cost:"",notes:"完成報到後再用餐與採買。" },
        { id:"d44",date:"2026-09-28",startTime:"19:05",endTime:"20:55",title:"CI179｜高松→桃園",category:"移動",transportMode:"飛機",origin:"高松空港 TAK",destination:"桃園國際機場 TPE",address:"桃園國際機場",lat:25.0797,lng:121.2342,cost:"",notes:"返回台灣。" }
      ]
    }
  }
];
