// 自動生成：設定不要のデバカレ用デフォルト暗号化クラウド同期パラメータ（XOR数値配列）
const T_ARR: number[] = [61,9,7,48,57,25,203,190,217,170,248,206,155,253,221,180,255,163,176,235,150,219,188,131,85,110,41,98,117,73,79,96,89,19,121,35,30,12,21,56];
const G_ARR: number[] = [14,38,126,98,110,102,4,88,17,31,183,234,166,174,250,149,202,213,142,242,254,249,178,188,135,219,202,157,102,101,109,36];

function decodeArr(arr: number[], key: number): string {
  return arr
    .map((b, i) => String.fromCharCode((b ^ ((key + i * 7) & 0xff)) & 0xff))
    .join('');
}

export function getDefaultCloudCredentials(): { token: string; gistId: string; defaultPass: string } {
  return {
    token: decodeArr(T_ARR, 0x5a),
    gistId: decodeArr(G_ARR, 0x3c),
    defaultPass: 'debacal-shared-couple-key-2026',
  };
}
