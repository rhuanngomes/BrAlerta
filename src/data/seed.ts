import type { Incident, IncidentCategory, IncidentStatus } from '../types';
export const DEMO_USER_ID = 'demo-demo@example.com';
const entries: Array<[IncidentCategory,string,string,number,number,IncidentStatus,string]> = [
 ['STREETLIGHT','Poste apagado próximo à praça','Trecho com pouca iluminação durante a noite.',-23.0244,-43.4642,'PENDING',DEMO_USER_ID],
 ['POTHOLE','Buraco próximo ao cruzamento','Desnível no asfalto exige atenção dos motoristas.',-23.0260,-43.4662,'IN_PROGRESS',DEMO_USER_ID],
 ['STREETLIGHT','Falha de iluminação residencial','Luminária não acende há alguns dias.',-23.0228,-43.4627,'RESOLVED','morador-02'],
 ['POTHOLE','Pavimento danificado','Dano demonstrativo próximo à faixa de pedestres.',-23.0271,-43.4639,'PENDING','morador-03'],
 ['STREETLIGHT','Poste sem iluminação na via','Área fica escura após o anoitecer.',-23.0236,-43.4680,'IN_PROGRESS',DEMO_USER_ID],
 ['POTHOLE','Irregularidade na rua comercial','Trecho danificado no sentido oeste.',-23.0251,-43.4608,'RESOLVED','morador-04'],
 ['STREETLIGHT','Luz intermitente na esquina','Iluminação oscila e apaga frequentemente.',-23.0209,-43.4651,'PENDING',DEMO_USER_ID],
 ['POTHOLE','Buraco em via secundária','Ocorrência fictícia para demonstração.',-23.0280,-43.4674,'PENDING','morador-05'],
 ['STREETLIGHT','Ponto escuro próximo ao parque','Poste sem funcionamento aparente.',-23.0217,-43.4598,'RESOLVED','morador-06'],
 ['POTHOLE','Asfalto cedendo próximo à curva','Área pequena, mas com risco para bicicletas.',-23.0248,-43.4690,'IN_PROGRESS',DEMO_USER_ID],
 ['FLOOD','Alagamento na Rua Clóvis Salgado','Demonstração: água acumulada, veículo ilhado e desvio sinalizado.',-23.02289266,-43.46291265,'PENDING','morador-07'],
 ['TRAFFIC','Congestionamento no cruzamento','Demonstração: fila de veículos e tráfego lento nas duas pistas.',-23.023043,-43.462575,'PENDING','morador-08'],
 ['SAFETY','Relato de assalto no bairro','Ocorrência fictícia para demonstrar a interação de segurança na cidade.',-23.02301556,-43.46337386,'PENDING','morador-09']
];
export const seedIncidents: Incident[] = entries.map((e,i) => { const createdAt = new Date(Date.now()-(i+1)*86400000).toISOString(); const id=`BRA-${String(i+1).padStart(4,'0')}`; return { id,userId:e[6],category:e[0],title:e[1],description:e[2],latitude:e[3],longitude:e[4],status:e[5],address:'Recreio dos Bandeirantes, Rio de Janeiro — RJ',createdAt,updatedAt:createdAt,history:[{id:`hist-${i}`,incidentId:id,newStatus:e[5],changedBy:'Sistema demonstrativo',changedAt:createdAt,eventType:'CREATED'}]}; });
